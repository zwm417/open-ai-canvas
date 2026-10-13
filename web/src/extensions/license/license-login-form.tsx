import { type FormEvent, useState } from "react";
import { App, Button, Input } from "antd";
import { ArrowRight, KeyRound } from "lucide-react";
import { useNavigate } from "react-router";

import { activateLicenseLogin } from "./license-api";
import { getAuthSession, invalidateAuthSessionCache } from "@/services/api/auth";

type LicenseLoginFormProps = {
    next?: string;
};

export function LicenseLoginForm({ next = "/canvas" }: LicenseLoginFormProps) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedCode = code.trim();
        if (!trimmedCode) {
            message.warning("请输入激活码");
            return;
        }

        setSubmitting(true);
        try {
            const result = await activateLicenseLogin(trimmedCode);
            invalidateAuthSessionCache();
            const { applyUserSession } = await import("@/lib/user-session");
            await applyUserSession(await getAuthSession());
            message.success(result.isNewUser ? "激活成功，已为您开启智影专属工作台" : "授权验证成功，欢迎回来");
            navigate(next, { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "激活失败，请检查激活码后重试");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
                <label htmlFor="license-code-input" className="block text-sm font-medium text-foreground">
                    激活码
                </label>
                <Input
                    id="license-code-input"
                    size="large"
                    prefix={<KeyRound className="auth-scene-icon size-4 text-muted-foreground" />}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="输入或粘贴授权激活码 (如 OPC-xxxx)"
                    autoComplete="off"
                    autoFocus
                    allowClear
                    disabled={submitting}
                />
            </div>
            <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={submitting}
                icon={<ArrowRight className="size-4" />}
                iconPlacement="end"
            >
                立即开启智影
            </Button>
        </form>
    );
}
