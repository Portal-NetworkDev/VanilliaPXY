import { server as wisp } from "@mercuryworkshop/wisp-js/server";

export function createWispTransport(options = {}) {
  if (options.hostnameBlacklist) wisp.options.hostname_blacklist = options.hostnameBlacklist;
  if (options.hostnameWhitelist) wisp.options.hostname_whitelist = options.hostnameWhitelist;
  if (options.portBlacklist) wisp.options.port_blacklist = options.portBlacklist;
  if (options.portWhitelist) wisp.options.port_whitelist = options.portWhitelist;
  if (options.dnsTtl) wisp.options.dns_ttl = options.dnsTtl;
  if (options.wispVersion) wisp.options.wisp_version = options.wispVersion;
  if (options.wispMotd !== undefined) wisp.options.wisp_motd = options.wispMotd;
  return wisp;
}

export function routeWisp(req, socket, head, path = "/wisp/") {
  const requestPath = new URL(req.url || "/", "http://localhost").pathname;
  if (requestPath !== path) {
    socket.end();
    return false;
  }
  req.url = path;
  wisp.routeRequest(req, socket, head);
  return true;
}
