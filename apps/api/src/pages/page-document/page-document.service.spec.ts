import { randomBytes } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectsRepository } from '../../projects/projects.repository';
import { InMemoryProjectsRepository } from '../../projects/projects.repository.in-memory';
import { ProjectsService } from '../../projects/projects.service';
import { TIPTAP_SCHEMA_VERSION } from '../constants';
import { PageNotFoundError } from '../errors';
import { PagesRepository } from '../pages.repository';
import { InMemoryPagesRepository, type StoredDocument } from '../pages.repository.in-memory';
import { PagesService } from '../pages.service';
import { PageDocumentRepository } from './page-document.repository';
import { InMemoryPageDocumentRepository } from './page-document.repository.in-memory';
import { PageDocumentService } from './page-document.service';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const missingId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-4444-444444444444';

describe('PageDocumentService', () => {
  let service: PageDocumentService;
  let pages: InMemoryPagesRepository;
  let documents: InMemoryPageDocumentRepository;

  const createPage = (ownerId = owner) =>
    pages.create({
      createdById: ownerId,
      ownerId,
      parentPageId: null,
      projectId,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      title: 'page',
    });

  beforeEach(async () => {
    // Одна таблица документов на оба репозитория: страницу создаёт один, а
    // содержимое читает другой.
    const store = new Map<string, StoredDocument>();
    pages = new InMemoryPagesRepository(store);
    documents = new InMemoryPageDocumentRepository(store, pages.pages);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PageDocumentService,
        PagesService,
        ProjectsService,
        { provide: PagesRepository, useValue: pages },
        { provide: PageDocumentRepository, useValue: documents },
        { provide: ProjectsRepository, useValue: new InMemoryProjectsRepository() },
      ],
    }).compile();

    service = moduleRef.get(PageDocumentService);
  });

  it('возвращает пустой документ только что созданной страницы', async () => {
    const page = await createPage();

    await expect(service.read(page.id, owner)).resolves.toEqual({
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array(),
    });
  });

  it('возвращает последнее записанное содержимое', async () => {
    const page = await createPage();
    const state = new Uint8Array([1, 2, 3]);

    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: 2,
      yjsState: state,
    });

    await expect(service.read(page.id, owner)).resolves.toEqual({
      pageId: page.id,
      tiptapSchemaVersion: 2,
      yjsState: state,
    });
  });

  it('заменяет содержимое целиком, а не объединяет записи', async () => {
    const page = await createPage();

    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array([1, 2, 3, 4]),
    });
    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array([9]),
    });

    const document = await service.read(page.id, owner);

    expect(document.yjsState).toEqual(new Uint8Array([9]));
  });

  it('принимает пустое содержимое', async () => {
    const page = await createPage();

    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array([1]),
    });
    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array(),
    });

    await expect(service.read(page.id, owner)).resolves.toMatchObject({
      yjsState: new Uint8Array(),
    });
  });

  it('не разбирает содержимое: произвольные байты возвращаются побайтно', async () => {
    const page = await createPage();
    const state = new Uint8Array(randomBytes(512));

    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: state,
    });

    const document = await service.read(page.id, owner);

    expect(Buffer.from(document.yjsState).equals(Buffer.from(state))).toBe(true);
  });

  it('инкрементирует счётчик ревизии и не выдаёт его наружу', async () => {
    const page = await createPage();

    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array([1]),
    });
    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array([2]),
    });

    expect(documents.documents.get(page.id)?.storageRevision).toBe(2);
    expect(Object.keys(await service.read(page.id, owner)).sort()).toEqual([
      'pageId',
      'tiptapSchemaVersion',
      'yjsState',
    ]);
  });

  it('отвечает одинаково на чужую и на несуществующую страницу при чтении', async () => {
    const foreign = await createPage(stranger);

    const foreignError = await service.read(foreign.id, owner).catch((error) => error);
    const missingError = await service.read(missingId, owner).catch((error) => error);

    expect(foreignError).toBeInstanceOf(PageNotFoundError);
    expect(missingError).toBeInstanceOf(PageNotFoundError);
    expect(foreignError.message).toBe(missingError.message);
  });

  it('не меняет чужой документ и отвечает той же ошибкой при записи', async () => {
    const foreign = await createPage(stranger);

    const foreignError = await service
      .replace({
        ownerId: owner,
        pageId: foreign.id,
        tiptapSchemaVersion: 7,
        yjsState: new Uint8Array([1]),
      })
      .catch((error) => error);
    const missingError = await service
      .replace({
        ownerId: owner,
        pageId: missingId,
        tiptapSchemaVersion: 7,
        yjsState: new Uint8Array([1]),
      })
      .catch((error) => error);

    expect(foreignError).toBeInstanceOf(PageNotFoundError);
    expect(missingError.message).toBe(foreignError.message);
    await expect(service.read(foreign.id, stranger)).resolves.toMatchObject({
      tiptapSchemaVersion: TIPTAP_SCHEMA_VERSION,
      yjsState: new Uint8Array(),
    });
  });

  it('не видит документ страницы с проставленной отметкой удаления', async () => {
    const page = await createPage();
    const stored = pages.pages.get(page.id);
    if (stored !== undefined) {
      stored.deletedAt = new Date();
    }

    await expect(service.read(page.id, owner)).rejects.toBeInstanceOf(PageNotFoundError);
  });

  it('отказывает записью, если страницу удалили после проверки', async () => {
    const page = await createPage();
    const state = new Uint8Array([1, 2, 3]);

    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: 2,
      yjsState: state,
    });
    await pages.softDelete(page.id, owner);

    // Репозиторий напрямую: сервис отсеял бы запрос своей проверкой, а гонка
    // происходит как раз после неё — проверка живости обязана быть в самой записи.
    await expect(
      documents.replace({
        pageId: page.id,
        tiptapSchemaVersion: 9,
        yjsState: new Uint8Array([9, 9]),
      }),
    ).resolves.toBeNull();
    expect(documents.documents.get(page.id)).toMatchObject({
      tiptapSchemaVersion: 2,
      yjsState: state,
    });
  });

  it('не затрагивает дерево при записи содержимого', async () => {
    const page = await createPage();

    await service.replace({
      ownerId: owner,
      pageId: page.id,
      tiptapSchemaVersion: 3,
      yjsState: new Uint8Array([1, 2]),
    });

    await expect(pages.findByIdForOwner(page.id, owner)).resolves.toMatchObject({
      ownerId: page.ownerId,
      parentPageId: page.parentPageId,
      position: page.position,
      projectId: page.projectId,
      title: page.title,
    });
  });
});
