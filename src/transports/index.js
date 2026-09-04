export class Transport {
  constructor(options = {}) {
    this.options = options;
  }

  async connect() {
    throw new Error("Transport.connect() must be implemented");
  }

  close() {}
}

const transports = new Map();

export function registerTransport(name, transport) {
  if (!name || !transport) throw new TypeError("A transport name and implementation are required");
  transports.set(name, transport);
}

export function getTransport(name) {
  return transports.get(name) || null;
}

export function listTransports() {
  return [...transports.keys()];
}
