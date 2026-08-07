const DOCUMENT_ID_REGISTRY = Symbol.for("layoutit.cornerfill.document-id-registry.v1");

interface DocumentIdRegistry {
  counters: Map<string, number>;
  namespace: string;
}

type RegistryDocument = Document & { [key: symbol]: unknown };

function randomNamespace(document: Document): string {
  const crypto = document?.defaultView?.crypto ?? globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID().replaceAll("-", "");
  if (typeof crypto?.getRandomValues === "function") {
    const words = new Uint32Array(4);
    crypto.getRandomValues(words);
    return [...words].map((word) => word.toString(36)).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function registry(document: Document): DocumentIdRegistry {
  const host = document as RegistryDocument;
  const existing = host[DOCUMENT_ID_REGISTRY];
  if (existing) return existing as DocumentIdRegistry;
  const value: DocumentIdRegistry = {
    counters: new Map(),
    namespace: randomNamespace(document),
  };
  Object.defineProperty(document, DOCUMENT_ID_REGISTRY, { value });
  return value;
}

export function nextDocumentId(document: Document, channel: string): string {
  const state = registry(document);
  const next = (state.counters.get(channel) ?? 0) + 1;
  state.counters.set(channel, next);
  return `cornerfill-${channel}-${state.namespace}-${next}`;
}
