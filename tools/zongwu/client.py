#!/usr/bin/env python3
"""安徽师范大学 总务监管服务平台 (zongwu.ahnu.edu.cn) 电费接口参考实现.

Reconstructed from the H5 pages served to 今日校园 / 手机浏览器:
  * 请求签名   HeadJson = {AppID, Code:yyyyMMddHHmmss, Sign:swapCase(md5(Code+ClientAppSecret))}
  * 报文体     "PWDDATA_" + CryptoJS AES(passphrase) 的 OpenSSL Salted__ 密文
  * 接口地址   https://zongwu.ahnu.edu.cn/gateway/sso/bbs/<Controller>/<Action>

用法:
    python client.py --operator-no 2020xxxxxxx
    python client.py --area 5004 --house <楼编号> --room <房间编号>
"""

from __future__ import annotations

import argparse
import base64
import datetime
import hashlib
import json
import os
import sys

import requests
import urllib3

urllib3.disable_warnings()

GATEWAY = "https://zongwu.ahnu.edu.cn/gateway/sso/bbs/"
CLIENT_APP_ID = "00000001"
CLIENT_APP_SECRET = "abcdefg"
# CryptoJS 口令, 取自页面运行时 window.RequestBodyAesKey()
BODY_AES_KEY = "12345678cgg54321"
DEFAULT_ORG_NO = "00110001"
DEFAULT_AREA_ID = "5004"  # <校区>

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes  # noqa: E402


# --------------------------------------------------------------------------
# 报文加密 (与 CryptoJS.AES.encrypt(str, passphrase) 二进制兼容)
# --------------------------------------------------------------------------


def _evp_bytes_to_key(passphrase: bytes, salt: bytes) -> tuple[bytes, bytes]:
    derived = b""
    prev = b""
    while len(derived) < 48:  # 32 字节 key + 16 字节 iv
        prev = hashlib.md5(prev + passphrase + salt).digest()
        derived += prev
    return derived[:32], derived[32:48]


def encrypt_body(plain: str, passphrase: str = BODY_AES_KEY) -> str:
    salt = os.urandom(8)
    key, iv = _evp_bytes_to_key(passphrase.encode(), salt)
    data = plain.encode()
    pad = 16 - len(data) % 16
    data += bytes([pad]) * pad
    enc = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    return base64.b64encode(b"Salted__" + salt + enc.update(data) + enc.finalize()).decode()


def decrypt_body(cipher_text: str, passphrase: str = BODY_AES_KEY) -> str:
    raw = base64.b64decode(cipher_text)
    if raw[:8] != b"Salted__":
        raise ValueError("not an OpenSSL salted payload")
    key, iv = _evp_bytes_to_key(passphrase.encode(), raw[8:16])
    dec = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    out = dec.update(raw[16:]) + dec.finalize()
    return out[: -out[-1]].decode("utf-8")


# --------------------------------------------------------------------------
# 请求封装
# --------------------------------------------------------------------------


def head_json() -> str:
    code = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    sign = hashlib.md5((code + CLIENT_APP_SECRET).encode()).hexdigest().swapcase()
    return json.dumps({"AppID": CLIENT_APP_ID, "Code": code, "Sign": sign}, separators=(",", ":"))


class ZongwuClient:
    def __init__(self, org_no: str = DEFAULT_ORG_NO, timeout: int = 20, verify: bool = False) -> None:
        self.org_no = org_no
        self.timeout = timeout
        self.verify = verify
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": "https://zongwu.ahnu.edu.cn/webzongwu/views/app/School/DXHQ/SchoolLOT/SchoolLOTTab.html",
        })

    def _post(self, path: str, payload: dict) -> dict:
        plain = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        headers = {"HeadJson": head_json()}
        resp = self.session.post(
            GATEWAY + path,
            data={"json": "PWDDATA_" + encrypt_body(plain)},
            headers=headers,
            timeout=self.timeout,
            verify=self.verify,
        )
        resp.raise_for_status()
        data = resp.json()
        model = data.get("Model")
        if isinstance(model, str) and model.startswith("PWDDATA_"):
            data["Model"] = json.loads(decrypt_body(model[8:], passphrase=BODY_AES_KEY))
        return data

    @staticmethod
    def _base(**kwargs) -> dict:
        model = {"TimeStamp": "", "iPageSize": 20, "pageIndex": 1, "bIsPage": True, "DBSrc": "10"}
        model.update(kwargs)
        return model

    # -- 查询 ---------------------------------------------------------------
    def areas(self, parent_id: str = DEFAULT_AREA_ID) -> list[dict]:
        data = self._post("Admin/BaseAreaTable/ClientAreaTable",
                          self._base(Opt="SelectByParentNo", ParentID=parent_id))
        return [m for m in (data.get("Model") or []) if m.get("AreaID")]

    def houses(self, area_id: str, house_type: str = "15") -> list[dict]:
        data = self._post("Org/SchoolHouse/ClientSchoolHouse",
                          self._base(Opt="Select2", OrgNo=self.org_no, AreaID=area_id,
                                     HouseType=house_type, IsQuery=True))
        return data.get("Model") or []

    def rooms(self, house_no: str) -> list[dict]:
        data = self._post("Org/SchoolRoom/ClientSchoolRoom",
                          self._base(Opt="Select2", OrgNo=self.org_no, HouseNo=house_no))
        return data.get("Model") or []

    def room_by_operator(self, operator_no: str) -> dict | None:
        """按电费用户编号反查房间."""
        data = self._post("Org/SchoolRoom/ClientSchoolRoom",
                          self._base(Opt="DetailByOperatorNo", OrgNo=self.org_no,
                                     OptNo=operator_no, pageIndex=0))
        return data.get("Model")

    def room_detail(self, room_no: str) -> dict | None:
        """房间余额: AmountDianShengYuAll 总余额 / AmountDianBuyShengYu 充值余额
        / NumDianBuyShengYu 剩余电量 / DianPrice 电价."""
        data = self._post("Org/SchoolRoom/ClientSchoolRoom",
                          self._base(Opt="Detail", OrgNo=self.org_no, No=room_no))
        return data.get("Model")

    def month_usage(self, room_no: str, key: str = "28") -> dict | None:
        """本月/上月用电、补助、充值 (Key=28)."""
        data = self._post("Org/SchoolLOT/ClientSchoolLOT",
                          self._base(Opt="DataCount", OrgNo=self.org_no, Key=key, Like0=room_no))
        model = data.get("Model") or []
        return model[0] if model else None

    def daily_usage(self, room_no: str, start: str, end: str, key: str = "10",
                    area_id: str = "", house_no: str = "") -> list[dict]:
        """区间用电明细: 日期 / Count / 剩余量 / 照明用电 / 空调用电.

        Key=10 用量+剩余量; Key=26 照明/空调拆分 (对应 H5 的两个入口).
        """
        payload = self._base(Opt="DataCount", OrgNo=self.org_no, Key=key,
                             Like1=area_id, Like2=house_no, Like3=room_no,
                             sDate=start, eDate=end, FKey="1000",
                             pageIndex=0, iPageSize=100)
        data = self._post("Org/SchoolLOT/ClientSchoolLOT", payload)
        return data.get("Model") or []


def main() -> int:
    ap = argparse.ArgumentParser(description="AHNU 电费查询参考实现")
    ap.add_argument("--operator-no", help="电费用户编号 (H5 里的 OperatorNo)")
    ap.add_argument("--room", help="房间编号 RoomNo, 例如 10000101")
    ap.add_argument("--area", default=DEFAULT_AREA_ID)
    ap.add_argument("--days", type=int, default=15)
    args = ap.parse_args()

    client = ZongwuClient()

    room_no = args.room
    if args.operator_no:
        room = client.room_by_operator(args.operator_no)
        if not room:
            print(f"未找到用户编号 {args.operator_no} 对应的房间", file=sys.stderr)
            return 1
        room_no = room["No"]
        print(f"用户 {args.operator_no} -> {room['HouseNo']}/{room['Name']} ({room_no})")

    if not room_no:
        ap.error("需要 --room 或 --operator-no")

    detail = client.room_detail(room_no) or {}
    month = client.month_usage(room_no) or {}

    today = datetime.date.today()
    start = (today - datetime.timedelta(days=args.days - 1)).isoformat()
    daily = client.daily_usage(
        room_no,
        start,
        today.isoformat(),
        area_id=detail.get("AreaID") or args.area,
        house_no=detail.get("HouseNo") or "",
    )

    summary = {
        "room": {
            "no": room_no,
            "name": detail.get("Name"),
            "house": detail.get("HouseName"),
            "area": detail.get("AreaName"),
        },
        "balance": {
            "total": detail.get("AmountDianShengYuAll"),
            "recharged": detail.get("AmountDianBuyShengYu"),
            "subsidy": detail.get("AmountDianUseShengYu"),
            "kwh_left": detail.get("NumDianShengYuALL"),
            "kwh_recharged_left": detail.get("NumDianBuyShengYu"),
            "kwh_subsidy_left": detail.get("NumDianBuZhuShengYu"),
            "price": detail.get("DianPrice"),
        },
        "month": {
            "last_month_kwh": month.get("上月用电"),
            "last_month_ac_kwh": month.get("上月空调用电"),
            "last_month_light_kwh": month.get("上月照明用电"),
            "this_month_kwh": month.get("当月用电"),
            "this_month_ac_kwh": month.get("当月空调用电"),
            "this_month_light_kwh": month.get("当月照明用电"),
            "this_month_subsidy_kwh": month.get("当月用电补助"),
            "this_month_recharge_kwh": month.get("当月用电充值"),
        },
        "daily": daily,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
