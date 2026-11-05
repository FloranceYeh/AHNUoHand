export interface PersonalInfo {
  nickname: string;
  studentId: string;
  avatar: string;
}

const STORAGE_KEY = "ahnuhand-profile";
const DEFAULT_INFO: PersonalInfo = {
  nickname: "师大学子",
  studentId: "",
  avatar: "",
};

export function readPersonalInfo(): PersonalInfo {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<PersonalInfo> | null;
    return {
      nickname:
        typeof value?.nickname === "string" && value.nickname.trim()
          ? value.nickname.trim()
          : DEFAULT_INFO.nickname,
      studentId: typeof value?.studentId === "string" ? value.studentId : "",
      avatar: typeof value?.avatar === "string" ? value.avatar : "",
    };
  } catch {
    return DEFAULT_INFO;
  }
}

export function savePersonalInfo(info: PersonalInfo): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    /* Ignore unavailable storage or quota errors. */
  }
}

export function saveStudentId(studentId: string): void {
  savePersonalInfo({ ...readPersonalInfo(), studentId: studentId.trim() });
}

/** 学号只由个人资料维护；平台服务在绑定成功后回写同一份本机资料。 */
export function getStudentId(): string {
  return readPersonalInfo().studentId;
}
