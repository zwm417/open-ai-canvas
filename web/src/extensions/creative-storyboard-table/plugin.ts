import { registerPlugin } from "@/lib/plugins/plugin-registry";
import type { PluginManifest, RegisteredPlugin } from "@/lib/plugins/plugin-types";
import {
    CREATIVE_STORYBOARD_REF_COLUMNS,
    CREATIVE_STORYBOARD_TABLE_DEFAULT_SIZE,
    CREATIVE_STORYBOARD_TABLE_MIN_SIZE,
    CREATIVE_STORYBOARD_TABLE_NODE_TYPE,
    CREATIVE_STORYBOARD_TABLE_PLUGIN_ID,
    CREATIVE_STORYBOARD_TEXT_COLUMNS,
} from "./contracts";

const manifest: PluginManifest = {
    apiVersion: "zhiying.plugin/v1",
    id: CREATIVE_STORYBOARD_TABLE_PLUGIN_ID,
    name: "创意分镜表",
    version: "1.0.0",
    description: "专业创意分镜总装表节点，支持多镜头物理时长弹性规划、参考脚本文本插槽、创意资产与创意配音动态装配、首帧图生图与镜头视频批量渲染。",
    author: "opc-Copilot",
    surfaces: ["node"],
    permissions: [
        "canvas.read",
        "canvas.write",
        "media.read",
        "ai.text",
    ],
    trusted: true,
    runtime: { backend: "trusted-backend", web: "declarative" },
    contributes: {
        canvasNodes: [
            {
                id: CREATIVE_STORYBOARD_TABLE_NODE_TYPE,
                label: "创意分镜表",
                defaultTitle: "创意分镜表",
                defaultSize: CREATIVE_STORYBOARD_TABLE_DEFAULT_SIZE,
                minSize: CREATIVE_STORYBOARD_TABLE_MIN_SIZE,
                schema: {
                    type: "object",
                    properties: {
                        batchTable: {
                            type: "object",
                            properties: {
                                operation: { type: "string" },
                                concurrency: { type: "number" },
                                rows: { type: "array" },
                            },
                        },
                    },
                },
                defaultMetadata: {
                    batchTable: {
                        operation: "creative",
                        concurrency: 10,
                        contentKind: "storyboard",
                        referenceColumns: CREATIVE_STORYBOARD_REF_COLUMNS,
                        textColumns: CREATIVE_STORYBOARD_TEXT_COLUMNS,
                        rows: [
                            {
                                id: "storyboard-row-1",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "【景别机位】特写，骑行者正前方微俯拍。\n【画面内容与动态运镜】焦点死锁在烈日直射严重反光的手机屏幕，随后镜头在0.5秒内快速微推至骑手紧蹙的眉眼。\n【微动作时序】0.0s 骑手跨坐在车上低头看手机，1.2s 烈日反光刺眼看不清，2.0s 抬起左手徒劳在屏幕上方遮光。\n【情绪/表情/眼神】眉头紧锁，眼神焦虑地眯起，满脸烦躁看不清路线。\n【真人质感与物理反馈】额角渗出细密汗珠，反光强烈，手指关节微颤，车把金属泛出耀眼高光。\n【音效与听觉设计】滚滚车流鸣笛声，烈日白噪音，突兀短促的急刹提示音。\n【台词与视听演绎/声音参考】骑手（眯眼皱眉，语速急促）：“大太阳下骑车，这导航全反光！”\n【分段生成衔接】手部正要放下，目光转向车把右侧。",
                                cells: {
                                    "col-time": "0-3s",
                                    "col-shot-desc": "特写微俯 · 烈日反光痛点",
                                    "col-image-prompt": "Close-up slightly high angle, on asphalt road at noon, a young delivery rider straddling an electric scooter looking down at the smartphone mounted on handlebar, intense sunlight causing severe white glare on the screen, realistic textures, 8k",
                                    "col-motion-prompt": "Focus locked on glaring screen, then quick push in 0.5s to rider's frowning eyes, hand raises to block sunlight",
                                    "col-creative-prompt": "【景别机位】特写，骑行者正前方微俯拍。\n【画面内容与动态运镜】焦点死锁在烈日直射严重反光的手机屏幕，随后镜头在0.5秒内快速微推至骑手紧蹙的眉眼。\n【微动作时序】0.0s 骑手跨坐在车上低头看手机，1.2s 烈日反光刺眼看不清，2.0s 抬起左手徒劳在屏幕上方遮光。\n【情绪/表情/眼神】眉头紧锁，眼神焦虑地眯起，满脸烦躁看不清路线。\n【真人质感与物理反馈】额角渗出细密汗珠，反光强烈，手指关节微颤，车把金属泛出耀眼高光。\n【音效与听觉设计】滚滚车流鸣笛声，烈日白噪音，突兀短促的急刹提示音。\n【台词与视听演绎/声音参考】骑手（眯眼皱眉，语速急促）：“大太阳下骑车，这导航全反光！”\n【分段生成衔接】手部正要放下，目光转向车把右侧。",
                                    "col-lines": "大太阳下骑车，这导航全反光！",
                                },
                            },
                            {
                                id: "storyboard-row-2",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "【景别机位】中景切特写，过肩跟拍机位。\n【画面内容与动态运镜】从发烫手机弹出过热警告向后快拉，焦点平滑过渡到骑手随身掏出的小巧米黄色头盔支架。\n【微动作时序】3.0s 手指触碰发烫机壳，4.2s 屏幕跳出高温警告，5.2s 单手利落从包中取出米黄色头盔支架。\n【情绪/表情/眼神】从烦躁转为警醒，眼神带着对手机受损的担忧。\n【真人质感与物理反馈】手机黑色玻璃后盖反射出强烈热浪与高热感，衣袖随手臂动作自然起伏，手机屏幕温度图标清晰逼真。\n【音效与听觉设计】轻微的手机系统警告音效，衣物摩擦微声。\n【台词与视听演绎/声音参考】骑手（无奈摇头，语气痛切）：“手机烫得直卡顿，差点走错路！”\n【分段生成衔接】支架拿在手中，正对车把卡槽准备卡入。",
                                cells: {
                                    "col-time": "3-6s",
                                    "col-shot-desc": "过肩中景 · 掏出头盔支架",
                                    "col-image-prompt": "Medium over-the-shoulder shot, the rider touches the overheated phone showing thermal warning, then takes out a compact beige helmet-shaped phone mount from sling bag, cinematic lighting, 8k",
                                    "col-motion-prompt": "Fast zoom out from phone screen, smooth rack focus to beige helmet mount in rider's hand",
                                    "col-creative-prompt": "【景别机位】中景切特写，过肩跟拍机位。\n【画面内容与动态运镜】从发烫手机弹出过热警告向后快拉，焦点平滑过渡到骑手随身掏出的小巧米黄色头盔支架。\n【微动作时序】3.0s 手指触碰发烫机壳，4.2s 屏幕跳出高温警告，5.2s 单手利落从包中取出米黄色头盔支架。\n【情绪/表情/眼神】从烦躁转为警醒，眼神带着对手机受损的担忧。\n【真人质感与物理反馈】手机黑色玻璃后盖反射出强烈热浪与高热感，衣袖随手臂动作自然起伏，手机屏幕温度图标清晰逼真。\n【音效与听觉设计】轻微的手机系统警告音效，衣物摩擦微声。\n【台词与视听演绎/声音参考】骑手（无奈摇头，语气痛切）：“手机烫得直卡顿，差点走错路！”\n【分段生成衔接】支架拿在手中，正对车把卡槽准备卡入。",
                                    "col-lines": "手机烫得直卡顿，差点走错路！",
                                },
                            },
                            {
                                id: "storyboard-row-3",
                                enabled: true,
                                inputNodeIds: [],
                                prompt: "【景别机位】近景，车把正上方45度斜俯拍。\n【画面内容与动态运镜】定焦于车把上的米黄色头盔手机支架，镜头环绕微转15度突出复古酷萌造型。\n【微动作时序】6.0s 单手捏住支架底爪扣上车把，7.5s 咔嗒一声底座旋紧，8.8s 酷萌头盔稳固立在车头。\n【情绪/表情/眼神】嘴角扬起自信亲切的笑容，眼神明亮笃定。\n【真人质感与物理反馈】单手手指指腹紧扣底爪受力微压，旋钮拧紧时伴随细致机械咬合微震，磨砂头盔外壳质感温润。\n【音效与听觉设计】清脆利落的机械卡扣声“咔嗒”，轻快有节奏的BGM节拍鼓点正式进场。\n【台词与视听演绎/声音参考】骑手（语气惊喜，自信展示）：“换上这个小头盔，直接给手机戴头盔！”\n【分段生成衔接】手指保持搭在支架边缘，准备向上调整遮阳挡板。",
                                cells: {
                                    "col-time": "6-10s",
                                    "col-shot-desc": "45度斜俯 · 咔嗒扣紧安装",
                                    "col-image-prompt": "Close-up 45-degree angle from above handlebar, hand securing the cute retro beige helmet phone mount onto black motorcycle handlebar with mechanical clamp, crisp sunny day, high detail, 8k",
                                    "col-motion-prompt": "Orbit pan 15 degrees around the helmet mount, crisp snapping lock dynamic movement",
                                    "col-creative-prompt": "【景别机位】近景，车把正上方45度斜俯拍。\n【画面内容与动态运镜】定焦于车把上的米黄色头盔手机支架，镜头环绕微转15度突出复古酷萌造型。\n【微动作时序】6.0s 单手捏住支架底爪扣上车把，7.5s 咔嗒一声底座旋紧，8.8s 酷萌头盔稳固立在车头。\n【情绪/表情/眼神】嘴角扬起自信亲切的笑容，眼神明亮笃定。\n【真人质感与物理反馈】单手手指指腹紧扣底爪受力微压，旋钮拧紧时伴随细致机械咬合微震，磨砂头盔外壳质感温润。\n【音效与听觉设计】清脆利落的机械卡扣声“咔嗒”，轻快有节奏的BGM节拍鼓点正式进场。\n【台词与视听演绎/声音参考】骑手（语气惊喜，自信展示）：“换上这个小头盔，直接给手机戴头盔！”\n【分段生成衔接】手指保持搭在支架边缘，准备向上调整遮阳挡板。",
                                    "col-lines": "换上这个小头盔，直接给手机戴头盔！",
                                },
                            },
                        ],
                    },
                },
                renderer: "declarative",
                acceptsInputKind: ["image", "video", "audio", "text"],
                showOutputConnection: true,
            },
        ],
    },
};

export const creativeStoryboardTablePlugin: RegisteredPlugin = { manifest };

registerPlugin(creativeStoryboardTablePlugin);
