export class DocumentCaptureUnavailableError extends Error {
  constructor() {
    super('Current document state is unavailable');
  }
}
