# 续篇：空教室接口是怎么啃下来的

> 上一篇《一次「抓包到复现」的完整复盘》讲的是宿舍电费——那是个明文 HTTP 接口，
> 抓到就能用。这一篇的空教室难得多：它在今日校园的 WebView 里跑 HTTPS，
> 而且大概率需要登录态。整个过程有三次判断失误，最后靠一个反直觉的现象破局。

---

## 0. 结论

```
https://ybt.ahnu.edu.cn/zhxyApi/rhpt-applets/kjs/api/getDataBy
    ?zcCode=<周次>&zcXqCode=<星期>&lhCode=<楼栋>&xqCode=<校区>
    → {"result":[{"js_name":"教学楼1510","kxjc":"1,2,3,...,13", ...}]}
```

- 站点 `ybt.ahnu.edu.cn`（学校一站式服务大厅），**不是**网上办事大厅 `ahnu.campusphere.net`
- 业务接口需要请求头 `X-Access-Token`（JWT），由 **CAS 票据**换取
- 该站点对我们放行 CORS，所以客户端可以直接 `fetch`，不必后端转发

---

## 1. 一开始以为是「再来一次电费」

电费能成，靠的是两点：接口是 `http://` 明文，且站点公网可直连。
所以空教室我先按同样的流程来：

```powershell
python tools/mitm/campus_mitm.py --mode observe --port 8080 --out capture/classroom.jsonl
adb reverse tcp:8080 tcp:8080
adb shell settings put global http_proxy 127.0.0.1:8080
```

观察模式只记录「连了谁、传了多少字节」，不解密，所以 App 不受影响。
结果很干脆：**一条相关的明文请求都没有**，全是第三方的 `api-share.mob.com`、`cfgc.zztfly.com`
之类；业务请求一律是 `CONNECT xxx:443`。

也就是说，这次没有「明文 HTTP」这条捷径。

---

## 2. 第一次判断失误：以为 WebView 能调试

电费那篇里，最后是靠 Chrome DevTools Protocol 从运行时读出了 AES 口令。
今日校园的页面也跑在 WebView 里，理论上同样的路子还能用：

```powershell
adb shell "cat /proc/net/unix | grep devtools"
```

结果只有 `browser_webview_devtools_remote_<pid>`（系统浏览器），**今日校园自己没开调试**。
`WebView.setWebContentsDebuggingEnabled(true)` 是 App 主动调用的，非 debuggable 包不会开，
这条路直接死掉。

---

## 3. 第二次判断失误：以为证书装不了就没法解密

要解密 HTTPS，得让 App 信任我自签的 CA。查了下 App 的清单：

```
minSdk=24  targetSdk=30
```

按 Android 的规则，`targetSdk ≥ 24` 的 App 默认不信任用户安装的证书，
而装系统证书需要 root——这台机器 `which su` 是空的，`verifiedbootstate=green`。

于是我当时给出的结论是：**这条路堵死了**。这个结论后来被证明是错的，
原因见第 6 节。

---

## 4. 转机：一个来自用户的判断

在办事处大厅（`ahnu.campusphere.net`）里翻服务列表时，用户说了句：

> 是不是这个页面没有空教室查询入口，被隐藏到其他路径里了

顺着这个思路验证：办事大厅的 `getServices` 只返回 4 个服务（趣活动、请假…），
首页「你可能想用」也只有那几个，**确实没有空教室**。那么它就不是门户服务，
而是今日校园里的独立 H5 应用——URL 只存在于 App 内部。

这解释了为什么之前一直找不到入口，也把问题收敛成一句话：
**要么拿到那个 URL，要么解开 App 的 HTTPS。**

---

## 5. 再试一次那条「堵死」的路

用户选择「装临时 CA 试解密」。于是：

```python
# 生成 CA（私钥只留在本机）
ca = CertAuthority(Path("capture/certs"), "Campus Capture CA")
```

把 `ca.crt` 推到 `/sdcard/Download/`，在设置里「安装证书 → CA 证书」装好，
然后代理切到 mitm 模式、设好代理、让用户点一次查询。

**结果出来了——而且还是明文的：**

```
GET https://ybt.ahnu.edu.cn/zhxyApi/rhpt-applets/kjs/api/getSchoolLhCode?xqName=赭山校区
   x-access-token: <JWT>
   referer: https://ybt.ahnu.edu.cn/zhxyH5/pagesA/view/home/queryApp/emptyClassRoom
   -> {"success":true,"result":[{"item_text":"教学楼","item_value":"101"}, ...]}
```

**站点不是 campusphere，而是 `ybt.ahnu.edu.cn`。**
`kjs` 就是「空教室」的拼音缩写，接口全都摊在 `/zhxyApi/rhpt-applets/kjs/api/` 下。

---

## 6. 一个反直觉的现象：WebView 信任了用户证书

翻日志时注意到，同一时刻有两类记录并存：

```
tls ybt.ahnu.edu.cn:443  SSLError: cert unknown      ← 被拒绝
GET https://ybt.ahnu.edu.cn/zhxyApi/...  -> 200      ← 成功解密
```

成功的那些请求，User-Agent 里带 `wv`（WebView）：

```
... <机型> Build/...; wv) AppleWebKit/537.36 ... Chromium/150 Android WebView/150
```

也就是说：

| 通道 | targetSdk=30 下对用户证书的态度 |
|---|---|
| App 原生网络栈（OkHttp） | 拒绝，握手失败 |
| **Chromium WebView** | **接受，正常解密** |

这和「targetSdk≥24 一律不信任用户证书」的简化说法不一致——
WebView 有自己的证书校验实现，实际行为要看版本。**结论应该来自实验，不是来自规则记忆**，
这也是这次最大的收获。

> 附带一个安全提醒：能装进用户证书，就意味着本机流量存在被中间人解密的可能。
> 抓完必须删掉，我在收尾时已经移除了。

---

## 7. 补齐最后一块：校区代码

抓到的参数长这样：

```
getDataBy?zcCode=10&zcXqCode=星期四&zcXqJcCodeBegin=&zcXqJcCodeEnd=&lhCode=101&xqCode=1
```

`lhCode=101` 是楼栋，`xqCode=1` 是校区。但只有赭山的数据，另外两个校区不知道对应几。
字典接口里也没有校区表（`school_xq` 之类全是空数组）。

于是请用户在 App 里切两次校区各查一次，一次抓包就补齐了：

| 校区 | `xqCode` | 楼栋示例 |
|---|---|---|
| 赭山校区 | `1` | 教学楼 `101`、田楼 `102` |
| 花津校区 | `2` | 1号教学楼 `201` |
| 天门山校区 | `3` | 北教学楼 `301` |

规律很干净：**楼号首位 = 校区号**。

---

## 8. 认证链路

从 H5 的 JS 包里读出了完整的登录流程：

```js
// 令牌过期时会跳这里
window.location.href = uniEnv.CAS_BASE_URL + "/login?service=" + uniEnv.APP_URL;

// 回跳带 ticket 时，用它换 token
$u.get("/cas/client/validateLogin", { ticket, service })
   .then(e => { uni.setStorageSync("token", e.result.token) })

// 之后的每个请求
request.header["X-Access-Token"] = uni.getStorageSync("token");
```

落成文字就是：

```
1. GET  https://ids.ahnu.edu.cn/authserver/login?service=<ybt H5 地址>
2. 用户登录 → CAS 回跳  https://ybt.ahnu.edu.cn/zhxyH5/?ticket=ST-xxxx
3. GET  /zhxyApi/cas/client/validateLogin?ticket=ST-xxxx&service=<...>
        → {"success":true,"result":{"token":"<JWT>"}}
4. 业务请求带 X-Access-Token: <JWT>
```

顺便确认了 CORS：

```
OPTIONS /zhxyApi/sys/dict/getDictItems/school_zc_xq
  access-control-allow-origin:  http://tauri.localhost
  access-control-allow-headers: x-access-token, content-type
  access-control-allow-credentials: true
```

来源被原样回显，说明可以直接在 Tauri 的前端里 `fetch`，不需要后端代理。

---

## 9. 一个容易卡住的细节：ALPN

在 PC 上直接用 `requests` 访问 `ybt.ahnu.edu.cn` 会报 `SSLError`，但裸 socket 握手又是通的。
原因是这台 nginx 在 TLS 握手没协商 ALPN 时会直接掐连接。加上一行就好：

```python
ctx = ssl.create_default_context(cafile=certifi.where())
ctx.set_alpn_protocols(["http/1.1"])      # ← 关键
ctx.minimum_version = ssl.TLSVersion.TLSv1_2
```

封装成了 `tools/zongwu/rawhttp.py`，顺带支持 chunked 解码。

---

## 10. 实现

| 文件 | 职责 |
|---|---|
| `src/lib/classroom.ts` | 换 token、字典、楼栋、查询、节次格式化 |
| `src/pages/ClassroomPage.tsx` | 校区/楼栋/周次/星期选择 + 教室卡片与节次色条 |
| `src-tauri/src/classroom.rs` | 开 CAS 登录窗口，用 `on_navigation` 截获回跳票据 |

登录这块刻意做成**不开源密码**的设计：窗口由 Rust 开，用户名密码只在学校页面上输入，
本应用只从跳转 URL 里取 `ticket`：

```rust
.on_navigation(move |target| {
    if let Some(index) = target.as_str().find("ticket=") {
        let ticket = ...;
        handle.emit("classroom-ticket", ticket);
        window.close();
        return false;
    }
    true
})
```

前端拿到票据后调 `validateLogin`，把 token 存本地。

界面上，把「空闲节次」从一串文字改成 13 格色条，配搜索框，扫一眼就能挑教室。

---

## 11. 踩坑清单

| 坑 | 现象 | 解法 |
|---|---|---|
| 连接池绕过代理 | 设了代理仍抓不到请求 | `force-stop` 后重开 App |
| WebView 调试没开 | 只有浏览器有 devtools socket | 无 root 无法开启，换思路 |
| 用户证书被拒 | `SSLError: cert unknown` | 原生栈拒绝，但 **WebView 接受** |
| `requests` 报 SSL | 裸 socket 却通 | 服务器要求 ALPN，设 `http/1.1` |
| 令牌失效 | `{"status":500,"message":"Token失效"}` | 注意返回的是 `status` 不是 `code` |
| 校区代码不明 | 字典接口返回空数组 | 切换校区各查一次，抓包比对 |
| 搜索跨楼栋 | 接口按楼栋查 | 先选楼栋，再在结果内筛选 |

---

## 12. 合规与收尾

- 令牌是个人凭证，只存本机 `localStorage`，退出登录即清除。
- 只做查询展示，不做预约、占座或批量抓取。
- **临时 CA 用完必须删**：设置 → 加密与凭据 → 受信任的凭据 → 用户 → 删除。
  抓包期间本机流量对持有私钥的人是可见的。
- 代理、`adb reverse`、推到手机上的证书文件，收尾时全部清理。

---

## 13. 这次学到什么

1. **「这条路堵死了」要留个反例验证的习惯。** 我基于 targetSdk 的规则断言证书方案不可行，
   而实际上 WebView 的行为和原生栈不同——规则是简化的，实验才是真的。
2. **用户的领域知识能省掉几小时。** 「它可能藏在别的路径」这句话直接排除了整个门户方向。
3. **抓包不是终点，链路才是。** 拿到接口只是开始，CAS→token→业务请求这条链路拼完整，
   功能才真正能落地。
4. **收尾和开局一样重要。** 证书、代理、转发，一样都不能留。
