/**
 * 学校 WebVPN（资源访问控制系统）的地址编码。
 *
 * 校外的校内站点都会被代理成：
 *   https://webvpn.ahnu.edu.cn/https/<token>/<原路径>
 *   https://webvpn.ahnu.edu.cn/http-<端口>/<token>/<原路径>
 *
 * `<token> = "wrdvpnisthebest!" + (host[i] XOR key[i])`
 *
 * 密钥表取自门户返回的真实地址（6 个样本逐字节求 XOR，零冲突）。
 * 前 17 字节由样本推导；更长的域名不在本表覆盖范围内，
 * 那种情况可直接用门户 `/user/portal_groups` 返回的 `redirect`。
 */

const VPN_HOST = "webvpn.ahnu.edu.cn";
const PREFIX = "wrdvpnisthebest!";

const KEY = [
  0x90, 0x97, 0x21, 0xfc, 0x47, 0x50, 0x08, 0x30, 0x1e, 0x68, 0xe9, 0xcc, 0xf8,
  0x35, 0x43, 0x55, 0xe8,
];

/** 把主机名编码成 WebVPN 的 token；超出密钥表则返回 null。 */
export function vpnToken(host: string): string | null {
  if (!host || host.length > KEY.length) return null;

  let out = PREFIX;
  for (let index = 0; index < host.length; index += 1) {
    out += String.fromCharCode(host.charCodeAt(index) ^ KEY[index]);
  }
  return Array.from(out, (char) =>
    char.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
}

export interface VpnTarget {
  /** 原始地址，例如 https://mjwgl.ahnu.edu.cn/ */
  origin: string;
  /** 经 WebVPN 代理后的地址 */
  proxied: string;
}

/**
 * 把校内地址转换成 WebVPN 代理地址。
 * 443 / 无端口走 `https`，80 走 `http`，其它端口走 `http-<port>`。
 */
export function toVpnUrl(rawUrl: string): VpnTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const token = vpnToken(url.hostname);
  if (!token) return null;

  const port = url.port ? Number.parseInt(url.port, 10) : 0;
  let scheme: string;
  if (port === 0 || port === 443) scheme = "https";
  else if (port === 80) scheme = "http";
  else scheme = `http-${port}`;

  const path = url.pathname === "" ? "/" : url.pathname;
  return {
    origin: rawUrl,
    proxied: `https://${VPN_HOST}/${scheme}/${token}/${path.replace(/^\//, "")}${url.search}`,
  };
}

/** WebVPN 登录入口：登录后由用户选择资源。 */
export function vpnLoginUrl(): string {
  return `https://${VPN_HOST}/login`;
}
