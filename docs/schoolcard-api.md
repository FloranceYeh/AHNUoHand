# 完美校园一卡通查询接口

## 入口与认证

完美校园入口使用学校 CAS：

```text
https://hub.17wanxiao.com/bsacs/light.action?flag=cassso_ansf_ecardh5&ecardFunc=index
```

登录后页面位于 `ecardh5.17wanxiao.com`。接口依赖该页面 WebView 的会话 Cookie，不能在应用主页面里直接使用匿名请求，也不保存账号密码。

## 查询接口

基址：`POST https://ecardh5.17wanxiao.com/ecardh5/bootcallback`

请求体为 `application/x-www-form-urlencoded`：

| 用途       | 请求体                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| 卡余额     | `gotowhere=XYK_BASE_INFO`                                                                              |
| 个人卡信息 | `gotowhere=userInfo`                                                                                   |
| 交易明细   | `beginIndex=0&pageSize=100&type=-1&beginDate=YYYY-MM-01&endDate=YYYY-MM-DD&gotowhere=XYK_TRADE_DETAIL` |

余额返回 `main_fare`、`subsidy_fare`、`fund_fare`、`nouseDate`；交易返回 `description`、`amount`、`businessopdt`、`term_name`、`orderno`、`type` 等字段。

## 项目实现

- `src/lib/schoolcard.ts` 按月份持久保存查询结果；再次查看已缓存月份时直接读取本机数据。
- Android 月份切换时由 Rust 从主 WebView CookieManager 读取完美校园会话 Cookie，再用原生 HTTP 请求查询接口，不导航主页面。尚未登录或会话失效时才打开登录入口。
- 桌面端使用独立登录窗口；移动端由主 WebView 直接请求带有完美校园服务地址的 CAS 登录 URL，并先经过 `about:blank` 避免 CAS 拒绝应用来源 Referer，再由 Rust 页面加载钩子提取结果。所选月份会跨登录回跳保留。
- 一卡通登录状态登记在统一「登录管理」中，认证仍由完美校园 CAS 入口处理。
- `src/pages/SchoolCardPage.tsx` 展示余额、月度消费趋势、按终端汇总的开销和交易明细；消费点别名只保存在本机。

查询只读余额和交易明细，不包含充值、解挂、改密等操作。
