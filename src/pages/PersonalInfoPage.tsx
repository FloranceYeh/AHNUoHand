import { useRef, useState } from "react";
import { Icon } from "../components/Icon";
import type { PersonalInfo } from "../lib/profile";

export function PersonalInfoPage({
  info,
  onSave,
  onBack,
}: {
  info: PersonalInfo;
  onSave: (info: PersonalInfo) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(info);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const updateAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("图片不能超过 5 MB");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 256;
        const scale = Math.min(size / image.width, size / image.height, 1);
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);
        setDraft((current) => ({
          ...current,
          avatar: canvas.toDataURL("image/jpeg", 0.82),
        }));
      };
      image.onerror = () => setError("图片读取失败，请换一张试试");
      image.src = String(reader.result);
    };
    reader.onerror = () => setError("图片读取失败，请重试");
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const nickname = draft.nickname.trim();
    if (!nickname) {
      setError("请填写昵称");
      return;
    }
    const studentId = draft.studentId.trim();
    if (studentId && !/^\d{6,20}$/.test(studentId)) {
      setError("学号请填写 6–20 位数字");
      return;
    }
    onSave({ ...draft, nickname, studentId });
  };

  return (
    <div className="page feature-page personal-info-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={18} />
        返回
      </button>
      <div className="page-heading">
        <p className="eyebrow">PERSONAL DETAILS</p>
        <h1>个人信息</h1>
        <p>设置你的校园身份信息，保存在当前设备。</p>
      </div>

      <section className="personal-info-card">
        <button
          className="personal-avatar-picker"
          onClick={() => fileInput.current?.click()}
          aria-label="更换头像"
        >
          {draft.avatar ? (
            <div className="personal-avatar">
              <img src={draft.avatar} alt="头像预览" />
            </div>
          ) : (
            <span>{draft.nickname.trim().slice(0, 1) || "同"}</span>
          )}
          <i>
            <Icon name="upload" size={14} />
          </i>
        </button>
        <input
          ref={fileInput}
          className="personal-avatar-input"
          type="file"
          accept="image/*"
          onChange={(event) => updateAvatar(event.target.files?.[0])}
        />
        <strong>点击更换头像</strong>
        <small>支持常见图片格式，最大 5 MB</small>
        {draft.avatar && (
          <button
            className="personal-avatar-remove"
            onClick={() => setDraft((current) => ({ ...current, avatar: "" }))}
          >
            移除头像
          </button>
        )}
      </section>

      <section className="personal-fields" aria-label="个人资料">
        <label className="personal-field">
          <span>昵称</span>
          <input
            value={draft.nickname}
            maxLength={24}
            placeholder="输入昵称"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                nickname: event.target.value,
              }))
            }
          />
        </label>
        <label className="personal-field">
          <span>学号</span>
          <input
            value={draft.studentId}
            inputMode="numeric"
            maxLength={20}
            placeholder="输入学号，供后勤服务绑定"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                studentId: event.target.value.replace(/\D/g, ""),
              }))
            }
          />
        </label>
        {error && <p className="elec-error-text">{error}</p>}
      </section>
      <button className="elec-primary personal-save" onClick={submit}>
        保存个人信息
      </button>
    </div>
  );
}
