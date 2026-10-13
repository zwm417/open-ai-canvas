import { http } from "@/services/api/request";
import type { LocalUser } from "@/services/api/auth";

export type UserLicense = {
    id: string;
    userId: string;
    licenseMasked: string;
    category: number;
    tier: string;
    status: string;
    expiresAt?: string;
    lastCheckedAt: string;
    createdAt: string;
    updatedAt: string;
};

export type ActivateLoginPayload = {
    user: LocalUser;
    license: UserLicense;
    isNewUser: boolean;
    grantedMicros: number;
};

export type LicenseStatusPayload = {
    licensed: boolean;
    license: UserLicense | null;
};

/**
 * 激活码一键开启 / 自动注册登录
 */
export function activateLicenseLogin(activationCode: string, deviceId?: string) {
    return http.post<ActivateLoginPayload>("/custom/license/activate-login", {
        activationCode: activationCode.trim(),
        deviceId: deviceId?.trim(),
    });
}

/**
 * 查询当前账号授权状态与到期时间
 */
export function getLicenseStatus() {
    return http.get<LicenseStatusPayload>("/custom/license/status");
}

/**
 * 已登录账号兑换新激活码续期
 */
export function bindLicenseCode(activationCode: string, deviceId?: string) {
    return http.post<{ license: UserLicense }>("/custom/license/bind", {
        activationCode: activationCode.trim(),
        deviceId: deviceId?.trim(),
    });
}
