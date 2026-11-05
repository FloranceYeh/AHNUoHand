# 一次「抓包到复现」的完整复盘：安师大宿舍电费接口

> 目标：给自己的校园助手加「宿舍电费」功能，但学校没有公开 API。
> 手段：adb + 自建代理 + H5 逆向 + Chrome DevTools Protocol。
> 结果：**50 行脚本在 PC 上直接查出余额与用电量**，不登录、不带 Cookie。
> 这篇按时间顺序写，每一步都带命令；照着做能复现到最后一个数字。

---

## 0. 你会拿到什么

```
<楼名>-<房间号>  余额 12.34 元  剩余 20.00 度
上月 100.00 度 / 本月 10.00 度
```

文末有可直接复制运行的完整脚本。中间过程里踩过的坑单独整理成第 9 节清单 ——
如果只想复现，直接看 2、3、7、8 节。

---

## 1. 环境与思路

| 项       | 值                                                      |
| -------- | ------------------------------------------------------- |
| 测试机   | Android 手机（非 root，SELinux enforcing）              |
| 目标 App | 今日校园 9.9.26（`com.wisedu.cpdaily`），安师大移动门户 |
| PC       | Windows + Python 3.12 + `adb`                           |

非 root 是这次的核心约束：装不了系统证书，改不了 iptables，用不了 tcpdump。
常规方案是 mitmproxy，但沙箱环境里 `pip` 装不上（临时目录没有删除权限），
于是干脆**自己写一个 100 多行的 HTTP/HTTPS 代理**，只依赖 `cryptography`。

后来证明这个决定是对的：整条链路上真正难的从来不是解密 TLS，而是**加密根本不在 TLS 层**。

---

## 2. 先搞清楚「手机前台是谁」

```powershell
adb devices -l
adb shell "dumpsys window | grep mCurrentFocus"
# mCurrentFocus=Window{... com.wisedu.cpdaily/com.wisorg.wisedu.common.BrowsePageActivity}
```

`BrowsePageActivity` 是今日校园的 H5 容器 —— 说明电费页是个网页，不是原生界面。
再看一眼屏幕（`adb exec-out screencap -p > screen.png`），确认页面上有
「宿舍充值缴纳 / 用户编号 / 选择校区-楼栋-房间 / 用电查询」。

顺手看了下已安装的第三方应用（`adb shell pm list packages -3`），
里面有几个常见的抓包/调试工具，但这次一个都没用上。

---

## 3. 把手机流量导到 PC（不 root）

关键技巧：**`adb reverse` 把手机的端口反向映射到电脑**，再改全局代理。

```powershell
adb reverse tcp:8080 tcp:8080          # 手机 127.0.0.1:8080 -> PC 8080
adb shell settings put global http_proxy 127.0.0.1:8080
adb shell settings get global http_proxy   # 回显 127.0.0.1:8080 才算成功
```

这样手机不需要和电脑同网段，也不涉及防火墙。

代理先跑**观察模式**（只记录目标域名和字节数，不解密、不破坏 App）：

```powershell
python tools/mitm/campus_mitm.py --mode observe --port 8080 --out capture/observe.jsonl
```

然后触发一次请求。**这里踩了第一个坑**：点了「宿舍用电查询」却一条记录都没有。
原因是 App 的原生网络层复用了早就建立好的连接池，新请求不会重新走系统代理。解决办法：

```powershell
adb shell am force-stop com.wisedu.cpdaily
adb shell monkey -p com.wisedu.cpdaily -c android.intent.category.LAUNCHER 1
```

重启后立刻冒出 28 条请求，其中两条是关键：

```
GET  http://cfgc.zztfly.com/v6/gcf?...        -> 200  4584B
POST http://upc.zztfly.com/v6/gcl             -> 200  14B（octet-stream 密文）
```

外加一堆 `*.campushoy.com:443` 的 CONNECT —— 那些是今日校园自己的业务，加密的 MO 通道
（请求头 `moid` + 400 多字节密文 + 响应只有 `{"status":200}`），**这是干扰项**，
继续啃它只会陷进 Wisedu 的私有协议里。

真正的线索是紧接着出现的一条：

```
GET http://zongwu.ahnu.edu.cn/webzongwu/views/app/Admin/SysPayRecord/
    H5SysPayRecordSuSheFeeAdd.html?OrgNo=00110001&AreaID=5004
    &OperatorNo=2020xxxxxxx&OperatorName=张三
    &Time=20261104220947&Sign=<32 位签名>
```

**明文 HTTP**，学校自己的域名，还带着 `Sign` 参数。到此方向明确了。

---

## 4. 拿到 H5 的源码，顺藤摸瓜

页面在公网上可达，直接从 PC 抓，不必再麻烦手机：

```powershell
$base = 'http://zongwu.ahnu.edu.cn/webzongwu'
Invoke-WebRequest "$base/views/app/Admin/SysPayRecord/H5SysPayRecordSuSheFeeAdd.html" -OutFile page.html
```

HTML 里只有三行有信息量：

```html
<script src="../../../../layuiadmin/lib/extBaseRes.js"></script>
<script src="../../../../layuiadmin/lib/util/md5.js"></script>
<script>
  LoadCSSJS("Admin/SysPayRecord/H5SysPayRecordSuSheFeeAdd.js");
</script>
```

`md5.js` 一出现，基本可以断定**签名是前端算的**。`LoadCSSJS` 的定义在 `extBaseRes.js`：
它把 `layuiadmin/app/` 作为前缀，并且顺带加载了一整串 `SysCommon*.js`。
把这一堆都下载下来（`config.js`、`lib/view.js`、`lib/admin.js`、`modules/*`……），
用 `grep` 找关键词，两个文件就把协议交代清楚了。

**`layuiadmin/config.js`** —— 端点和应用凭据：

```js
ClientUrl: "https://zongwu.ahnu.edu.cn/gateway/sso/bbs/";
ApiUrl: "https://zongwu.ahnu.edu.cn/gateway/apifix/bbs/";
ClientAppID: "00000001";
ClientAppSecret: "abcdefg";
DefaultOrgNo: "00110001"; // 安徽师范大学
DefaultAreaID: "5004"; // <校区>
```

**`layuiadmin/lib/view.js`** —— 请求拦截器，两件事：

```js
// 1) 头签名
if ("2" === authvalid) {
  t.AppID = setter.ClientAppID;
  t.Code = formatDate(new Date(), "yyyyMMddHHmmss");
  t.Sign = swapCase(hex_md5(t.Code + setter.ClientAppSecret));
  xhr.setRequestHeader("HeadJson", JSON.stringify(t));
}

// 2) 报文体加密
e.data.json =
  "PWDDATA_" + CryptoJS.AES.encrypt(e.data.json, window.RequestBodyAesKey());
```

于是协议成型：

```
POST https://zongwu.ahnu.edu.cn/gateway/sso/bbs/<Controller>/<Action>
Content-Type: application/x-www-form-urlencoded
HeadJson: {"AppID":"00000001","Code":"yyyyMMddHHmmss","Sign":"swapCase(md5(Code+abcdefg))"}

json=PWDDATA_<base64>
```

签名这块可以立刻验算（`md5("20261104223000"+"abcdefg")`）：

```
051d7be804f5bab2dca7f73a9403d455
051D7BE804F5BAB2DCA7F73A9403D455   <- swapCase 之后
```

拿着这个头去请求，网关的报错会一路变化，正好当进度条：

| 阶段                     | 网关返回                                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| 什么都不带               | `{"Msg":"HeadJson鉴权值不能为空!","State":"301"}`                      |
| 只有 HeadJson、明文 json | `{"Msg":"报文不合法!","State":"-1"}`                                   |
| `PWDDATA_` 但密钥错      | `{"Msg":"对不起,参数验证失败!数据异常，非法获取！！！","State":"-99"}` |
| 全部正确                 | `{"State":"1","Model":{...}}`                                          |

---

## 5. 卡住的那一段：那枚 AES 口令

协议清楚了，只差 `window.RequestBodyAesKey()` 的返回值。

按照「前端一定带密钥」的直觉，我把能想到的地方翻了一遍：

1. **所有 JS**：`grep -i AesKey` 全库只命中 `view.js` 里的*调用*，没有赋值。
2. **APK**：`adb pull` 下 151MB 的 `base.apk`，用 `zipfile` 遍历所有条目搜
   `RequestBodyAesKey` —— 零命中。后来注意到 `assets/ijiami.dat`，
   这是**爱加密**加固的特征，DEX 里的字符串在运行时才解密，静态搜不到很正常。
3. **logcat**：`adb logcat -s chromium` 翻了 4000 行，也没有。

于是得出一个**看起来很有道理、其实完全错误**的结论：
「这个函数是今日校园的原生容器注入的，第三方客户端没法调用」。
按这个结论，功能只能放弃，或者去求学校开接口。

**推翻它的证据来自一个反例**：把同一个 H5 用手机自带浏览器打开，
页面居然能正常查出数据（余额 12.34 元、剩余 20.00 度）。
如果口令是容器注入的，普通浏览器不可能查出东西。

所以口令一定在页面自己身上。我漏了文件 —— 而且漏得很蠢：
`view.js` 里调用的是 `i.appendLoginFieldsToRequestJson`，其中 `i = layui.element`，
说明**学校放了一个非官方的 layui 定制模块**。去抓那个模块时又全是 404。

### 转折：不用找文件了，直接问运行时

既然页面能跑，就说明运行时能拿到值。想到系统自带浏览器是 Chromium 内核，大概率开了远程调试：

```powershell
adb shell "cat /proc/net/unix | grep -i devtools"
# @chrome_devtools_remote
# @browser_webview_devtools_remote_19466
```

`@chrome_devtools_remote` 连上了但超时，换第二个：

```powershell
adb forward tcp:9224 localabstract:browser_webview_devtools_remote_19466
```

```python
# GET /json/list 必须带 Host: localhost，否则 Chrome 直接断连接
c.putrequest("GET", "/json/list", skip_host=True)
c.putheader("Host", "localhost:9224")
```

这次返回了目标列表 —— 页面就在里面。于是手写一个最小 WebSocket 客户端（RFC6455 文本帧，
`tools/mitm/cdp_eval.py`，100 行、零依赖），发一条 `Runtime.evaluate`：

```powershell
python tools/mitm/cdp_eval.py --port 9224 `
  --eval "String(window.RequestBodyAesKey())"
# 12345678cgg54321
```

**16 个字符，平台硬编码的弱口令。** 整条链路当场打通。

> 回头看，第 5 节的弯路价值最大：它教会我一件事 ——
> **「代码里没有」不等于「运行时没有」**。静态分析走到死胡同时，
> 应该去找那个能执行代码的地方（DevTools、调试器、REPL），而不是继续 grep。

---

## 6. 复现接口：50 行脚本

口令是 CryptoJS 的**口令模式**（`Salted__` + `EVP_BytesToKey(MD5)`，AES-256-CBC），
不是把字符串直接当 key —— 这一步搞错的话密文长度对、解密全乱。

```python
"""最小复现：安师大宿舍电费查询"""
import base64, datetime, hashlib, json, os
import requests
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

GATEWAY = "https://zongwu.ahnu.edu.cn/gateway/sso/bbs/"
APP_ID, APP_SECRET, AES_KEY, ORG = "00000001", "abcdefg", "12345678cgg54321", "00110001"


def head_json():
    code = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    sign = hashlib.md5((code + APP_SECRET).encode()).hexdigest().swapcase()
    return json.dumps({"AppID": APP_ID, "Code": code, "Sign": sign}, separators=(",", ":"))


def _kdf(pw, salt):                      # CryptoJS 的 EVP_BytesToKey
    d = prev = b""
    while len(d) < 48:
        prev = hashlib.md5(prev + pw + salt).digest()
        d += prev
    return d[:32], d[32:48]              # 32B key + 16B iv


def encrypt(plain, pw=AES_KEY):
    salt = os.urandom(8)
    key, iv = _kdf(pw.encode(), salt)
    data = plain.encode()
    data += bytes([16 - len(data) % 16]) * (16 - len(data) % 16)
    enc = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    return base64.b64encode(b"Salted__" + salt + enc.update(data) + enc.finalize()).decode()


def decrypt(b64, pw=AES_KEY):
    raw = base64.b64decode(b64)
    key, iv = _kdf(pw.encode(), raw[8:16])
    out = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor().update(raw[16:])
    return out[:-out[-1]].decode()


def call(path, payload):
    payload = {"TimeStamp": "", "iPageSize": 20, "pageIndex": 1,
               "bIsPage": True, "DBSrc": "10", **payload}
    body = {"json": "PWDDATA_" + encrypt(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))}
    r = requests.post(GATEWAY + path, data=body, timeout=20,
                      headers={"HeadJson": head_json(),
                               "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})
    r.raise_for_status()
    data = r.json()
    # 响应里的 Model 有时也套一层 PWDDATA_
    if isinstance(data.get("Model"), str) and data["Model"].startswith("PWDDATA_"):
        data["Model"] = json.loads(decrypt(data["Model"][8:]))
    return data


OP_NO = "2020xxxxxxx"          # 换成自己的学号（充值页「用户编号」那一栏）

room = call("Org/SchoolRoom/ClientSchoolRoom",
            {"Opt": "DetailByOperatorNo", "OrgNo": ORG,
             "OptNo": OP_NO, "pageIndex": 0})["Model"]

d = call("Org/SchoolRoom/ClientSchoolRoom",
         {"Opt": "Detail", "OrgNo": ORG, "No": room["No"]})["Model"]
print(f"{d['HouseName']}-{d['Name']}  余额 {d['AmountDianShengYuAll']:.2f} 元  剩余 {d['NumDianShengYuALL']} 度")

m = call("Org/SchoolLOT/ClientSchoolLOT",
         {"Opt": "DataCount", "OrgNo": ORG, "Key": "28", "Like0": room["No"]})["Model"][0]
print(f"上月 {m['上月用电']} 度 / 本月 {m['当月用电']} 度")
```

输出（数值已脱敏，仅示格式）：

```
<楼名>-<房间号>  余额 12.34 元  剩余 20.00 度
上月 100.00 度 / 本月 10.00 度
```

和手机上「电费充值」页面显示的数字**逐项一致**（剩余电量 20.00、总余额 12.34、
剩余充值 8.39），复现完成。

---

## 7. 接口清单

全部 `POST`，地址前缀 `https://zongwu.ahnu.edu.cn/gateway/sso/bbs/`，
公共字段 `TimeStamp:"" / DBSrc:"10" / bIsPage:true / pageIndex / iPageSize`。

| 用途         | 路径                                  | `Opt`                | 关键参数                                                 |
| ------------ | ------------------------------------- | -------------------- | -------------------------------------------------------- |
| 校区列表     | `Admin/BaseAreaTable/ClientAreaTable` | `SelectByParentNo`   | `ParentID`                                               |
| 宿舍楼列表   | `Org/SchoolHouse/ClientSchoolHouse`   | `Select2`            | `OrgNo`、`AreaID`、`HouseType:"15"`                      |
| 房间列表     | `Org/SchoolRoom/ClientSchoolRoom`     | `Select2`            | `OrgNo`、`HouseNo`                                       |
| 按编号查房   | `Org/SchoolRoom/ClientSchoolRoom`     | `DetailByOperatorNo` | `OptNo`、`pageIndex:0`                                   |
| 电费详情     | `Org/SchoolRoom/ClientSchoolRoom`     | `Detail`             | `No`（房间号）                                           |
| 月度统计     | `Org/SchoolLOT/ClientSchoolLOT`       | `DataCount`          | `Key:"28"`、`Like0`                                      |
| 每日明细     | `Org/SchoolLOT/ClientSchoolLOT`       | `DataCount`          | `Key:"10"`、`Like1/2/3`、`sDate`、`eDate`、`FKey:"1000"` |
| 照明空调拆分 | 同上                                  | `DataCount`          | `Key:"26"`                                               |

字段（`Detail`）：`NumDianShengYuALL` 剩余电量、`NumDianBuyShengYu` 充值电量、
`NumDianBuZhuShengYu` 补助电量、`AmountDianShengYuAll` 余额、
`AmountDianBuyShengYu` 充值余额、`AmountDianUseShengYu` 补助余额、`DianPrice` 电价。

`Key=28` 的返回更特别 —— 是**中文键**：
`上月用电`、`当月用电`、`当月用电补助`、`当月用电充值`、`当月空调用电`、
`当月照明用电`。

---

## 8. 想自己从头走一遍

```powershell
# 1. 代理 + 引流
python tools/mitm/campus_mitm.py --mode observe --port 8080 --out capture/observe.jsonl
adb reverse tcp:8080 tcp:8080
adb shell settings put global http_proxy 127.0.0.1:8080

# 2. 让 App 重开连接（否则连接池会绕过代理）
adb shell am force-stop com.wisedu.cpdaily
adb shell monkey -p com.wisedu.cpdaily -c android.intent.category.LAUNCHER 1
#    然后在手机上点「电费充值」

# 3. 看日志
Get-Content capture/observe.jsonl

# 4. 抓 H5 资源（明文 HTTP，直接下载）
Invoke-WebRequest "http://zongwu.ahnu.edu.cn/webzongwu/layuiadmin/config.js" -OutFile config.js
Invoke-WebRequest "http://zongwu.ahnu.edu.cn/webzongwu/layuiadmin/lib/view.js"  -OutFile view.js

# 5. 取运行时口令
adb shell "cat /proc/net/unix | grep devtools"          # 找到 browser_webview_devtools_remote_<pid>
adb forward tcp:9224 localabstract:browser_webview_devtools_remote_<pid>
python tools/mitm/cdp_eval.py --port 9224 --eval "String(window.RequestBodyAesKey())"

# 6. 跑第 6 节脚本

# 7. 收工，务必复原
adb shell settings put global http_proxy :0
adb forward --remove-all
```

---

## 9. 踩坑清单

| 坑                | 现象                                     | 解法                                                                                           |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 代理不生效        | 点按钮零请求                             | App 连接池复用旧连接；`force-stop` 后重开                                                      |
| 观察模式没内容    | `observe` 只记录 CONNECT 的域名和字节数  | 明文 HTTP 才看得到完整请求，别急着上 MITM                                                      |
| 上游证书校验失败  | `unable to get local issuer certificate` | Windows 根证书不全，用 `certifi` 的 bundle                                                     |
| 回包乱码          | 客户端 `IncompleteRead`                  | 去 chunked 后必须**重写** `Content-Length`，不能照抄 `Transfer-Encoding`                       |
| .NET 连不上 HTTPS | `安全包中没有可用的凭证`（Schannel）     | 换 Python/OpenSSL 客户端                                                                       |
| DevTools 连不上   | `RemoteDisconnected`                     | `/json/list` 必须带 `Host: localhost`；socket 名可能是 `browser_webview_devtools_remote_<pid>` |
| 解密全乱          | 长度对、内容错                           | CryptoJS 是**口令模式**：`EVP_BytesToKey(MD5)` 派生 key/iv                                     |
| 签名被拒          | `HeadJson鉴权值不能为空!`                | `Sign` 要 `swapCase`，`Code` 必须是 `yyyyMMddHHmmss`                                           |
| 查不到房间        | `Model:null`                             | 「用户编号」**就是学号**（11 位数字），抄错一位就查不到                                        |
| 分页为空          | 列表返回空                               | `pageIndex` 从 **0** 开始（页面里是 `pageIndex - 1`）                                          |

---

## 10. 边界与合规

- **弱口令是平台的实现缺陷**，不是授权。`12345678cgg54321` 随时可能被换掉，
  所以客户端要把它做成可配置项，并在鉴权失败时给出可读提示，而不是崩栈。
- **接口没有身份校验**：只凭学号就返回房间余额，而学号是可推断的（年级+专业+序号），
  等于「输入任意学号就能看到该生住哪间寝室」。
  本次只查了账号本人的房间，也建议任何复刻者**只查自己/已授权的寝室**，
  不做批量枚举 —— 那既侵犯隐私，也容易触发风控。
- 只做查询与展示。充值类接口（`CommonChargeMoney` 等）虽然也在这条链路上，
  **不要**拿它去做代扣或自动化支付。
- 频率未知，本地缓存 60–300 秒，别轮询。

---

## 11. 最后：这次真正学会了什么

1. **先看流量，再看代码。** 前两小时我在啃供应商的加密 SDK，其实真接口就在明文 HTTP 的校本系统里。
2. **错误结论要用反例验证。** 「口令是容器注入的」听起来严密，但一个普通浏览器能跑通就足以推翻它。
3. **静态分析到尽头，就去运行时。** DevTools 的一句 `Runtime.evaluate` 顶得上几千行 grep。
4. **协议分析要留进度条。** 网关那四种报错（301 → 报文不合法 → 数据异常 → State:1）
   本身就是最好的调试器。
5. **收尾比开局重要。** 代理、`adb forward`、证书、临时 APK 都得清干净 ——
   这篇能复现，靠的是最后那两条复原命令。

> 取证与工具都在仓库里：`tools/mitm/campus_mitm.py`（代理）、
> `tools/mitm/cdp_eval.py`（CDP 客户端）、`tools/zongwu/client.py`（完整客户端）、
> `docs/electricity-api.md`（接口文档）。
