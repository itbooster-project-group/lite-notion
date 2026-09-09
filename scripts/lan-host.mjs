export const LAN_HOST_HINT = 'Set LAN_HOST=<IP> pnpm dev:lan to choose a reachable IPv4.';

function parseIpv4Address(address) {
  if (typeof address !== 'string') {
    return undefined;
  }

  const parts = address.split('.');

  if (parts.length !== 4) {
    return undefined;
  }

  const octets = [];

  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      return undefined;
    }

    const value = Number(part);

    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return undefined;
    }

    octets.push(value);
  }

  return octets;
}

export function isPrivateIpv4Address(address) {
  const octets = parseIpv4Address(address);

  if (octets === undefined) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function isClientUsableUnicastIpv4Address(address) {
  const octets = parseIpv4Address(address);

  if (octets === undefined) {
    return false;
  }

  const [first, second, third, fourth] = octets;

  return (
    first !== 0 &&
    first !== 127 &&
    first < 224 &&
    !(first >= 240 && first <= 255) &&
    !(first === 255 && second === 255 && third === 255 && fourth === 255)
  );
}

function isIpv4Family(family) {
  return family === 'IPv4' || family === 4;
}

export function isSelectableLanAddress(entry) {
  return (
    entry !== undefined &&
    entry !== null &&
    !entry.internal &&
    isIpv4Family(entry.family) &&
    isPrivateIpv4Address(entry.address)
  );
}

export function findPrivateLanIpv4(interfaces) {
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (isSelectableLanAddress(entry)) {
        return entry.address;
      }
    }
  }

  return undefined;
}

export function resolveLanHost({ lanHost, interfaces }) {
  const override = lanHost?.trim();

  if (override !== undefined && override.length > 0) {
    if (isClientUsableUnicastIpv4Address(override)) {
      return override;
    }

    throw new Error(`LAN_HOST must be a client-usable unicast IPv4 address. ${LAN_HOST_HINT}`);
  }

  const detectedAddress = findPrivateLanIpv4(interfaces);

  if (detectedAddress !== undefined) {
    return detectedAddress;
  }

  throw new Error(`Could not detect a private LAN IPv4 address. ${LAN_HOST_HINT}`);
}
