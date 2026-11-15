const errorDetails = {
  UNAUTHENTICATED: {
    status: 401,
    message: "Authentication is required.",
  },
  PROFILE_INCOMPLETE: {
    status: 403,
    message: "The account profile must be completed before accessing Lab features.",
  },
  LAB_NOT_FOUND: {
    status: 404,
    message: "Lab not found.",
  },
  FORBIDDEN: {
    status: 403,
    message: "You do not have permission to perform this action.",
  },
};

/**
 * @typedef {keyof typeof errorDetails} AuthorizationErrorCode
 * @typedef {{ id: string }} AuthenticatedUser
 * @typedef {{ userId: string, labId: string }} LabAccess
 * @typedef {{
 *   user: {
 *     findUnique: (args: {
 *       where: { id: string },
 *       select: { userType: true, studentNumber: true }
 *     }) => Promise<{ userType: string | null, studentNumber: string | null } | null>
 *   },
 *   labMember: {
 *     findUnique: (args: {
 *       where:
 *         | { labId_userId: { labId: string, userId: string } }
 *         | { userId: string },
 *       select: { labId: true }
 *     }) => Promise<{ labId: string } | null>
 *   },
 *   lab: {
 *     findFirst: (args: {
 *       where: { id: string, members: { some: { userId: string } } },
 *       select: { ownerId: true }
 *     }) => Promise<{ ownerId: string } | null>
 *   }
 * }} AuthorizationDatabase
 */

export class AuthorizationError extends Error {
  /** @param {AuthorizationErrorCode} code */
  constructor(code) {
    super(errorDetails[code].message);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = errorDetails[code].status;
  }
}

/**
 * ユーザー種別ごとの学生番号の条件を満たせば、プロフィールは完了と判定する。
 * 表示名は編集できる任意項目。
 *
 * @param {{ userType: string | null, studentNumber: string | null } | null} profile
 */
export function isProfileComplete(profile) {
  if (!profile) {
    return false;
  }

  const isTeacherWithoutStudentNumber =
    profile.userType === "TEACHER" && profile.studentNumber === null;
  const isStudentWithStudentNumber =
    profile.userType === "STUDENT" &&
    typeof profile.studentNumber === "string" &&
    profile.studentNumber.trim().length > 0;

  return isTeacherWithoutStudentNumber || isStudentWithStudentNumber;
}

/**
 * Auth.jsとPrismaを使ってサーバー側の認可関数を作る。
 * 依存を引数で受け取り、実際のDBやAuth.jsのセッションなしで認可の判定と検索範囲をテストできるようにする。
 *
 * @param {{ getSession: () => Promise<{ user?: { id?: string | null } } | null>, db: AuthorizationDatabase }} dependencies
 */
export function createAuthorizationHelpers({ getSession, db }) {
  async function requireUser() {
    const session = await getSession();
    const userId = session?.user?.id;

    if (typeof userId !== "string" || userId.length === 0) {
      throw new AuthorizationError("UNAUTHENTICATED");
    }

    return { id: userId };
  }

  async function requireProfileCompleteUser() {
    const user = await requireUser();
    await requireCompleteProfile(user.id);
    return user;
  }

  async function requireCompleteProfile(userId) {
    const profile = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true, studentNumber: true },
    });

    if (!isProfileComplete(profile)) {
      throw new AuthorizationError("PROFILE_INCOMPLETE");
    }
  }

  function requireLabId(labId) {
    if (typeof labId !== "string" || labId.trim().length === 0) {
      throw new AuthorizationError("LAB_NOT_FOUND");
    }
  }

  /** @returns {Promise<AuthenticatedUser>} */
  async function requireUserForLab(labId) {
    const user = await requireUser();
    requireLabId(labId);
    await requireCompleteProfile(user.id);
    return user;
  }

  /** @param {string} labId @returns {Promise<LabAccess>} */
  async function requireLabMember(labId) {
    const user = await requireUserForLab(labId);
    const membership = await db.labMember.findUnique({
      where: { labId_userId: { labId, userId: user.id } },
      select: { labId: true },
    });

    if (!membership) {
      throw new AuthorizationError("LAB_NOT_FOUND");
    }

    return { userId: user.id, labId: membership.labId };
  }

  /** @param {string} labId @returns {Promise<LabAccess>} */
  async function requireLabOwner(labId) {
    const user = await requireUserForLab(labId);
    const lab = await db.lab.findFirst({
      where: {
        id: labId,
        members: { some: { userId: user.id } },
      },
      select: { ownerId: true },
    });

    if (!lab) {
      throw new AuthorizationError("LAB_NOT_FOUND");
    }

    if (lab.ownerId !== user.id) {
      throw new AuthorizationError("FORBIDDEN");
    }

    return { userId: user.id, labId };
  }

  return {
    requireUser,
    requireProfileCompleteUser,
    requireLabMember,
    requireLabOwner,
  };
}
