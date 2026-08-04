const DEFAULT_TRUST_PROXY_HOPS = 0;
const MAX_TRUST_PROXY_HOPS = 5;

const parseTrustProxyHops = (raw) => {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_TRUST_PROXY_HOPS;
  }

  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < DEFAULT_TRUST_PROXY_HOPS ||
    value > MAX_TRUST_PROXY_HOPS
  ) {
    return DEFAULT_TRUST_PROXY_HOPS;
  }

  return value;
};

const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);

module.exports = {
  parseTrustProxyHops,
  trustProxyHops,
  DEFAULT_TRUST_PROXY_HOPS,
  MAX_TRUST_PROXY_HOPS,
};
