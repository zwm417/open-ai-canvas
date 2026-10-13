# High-Fidelity Imaging Precision Master｜最高品质成像精度参考

## 根原则

智影只做最高品质，不设置画质降档。所有“精度预算”都发生在最高品质内部，用来决定当前观看尺度哪些信息必须获得Hero主权，哪些信息只需保持正确结构与材料家族，哪些高速区域可以用方向性模糊换速度证据。

## 七轴

1. Geometry / Asset Precision：轮廓、脸、发束、布料层、兵器刃口、甲片/鳞甲、建筑/巨构结构。
2. Material Response Precision：材料身份、表面状态、粗糙/镜面、透射/散射、接触与环境响应。
3. Lighting & Radiometric Precision：主光、GI/间接光、接触阴影、体积空气、VFX事件光与衰减。
4. Optical & Motion Precision：动态范围、高光滚降、黑位、景深、焦外、颗粒、Bloom/halation、运动模糊与Hero清晰。
5. VFX Internal Resolution：Core、Body、Surface、Edge、Secondary、Trail、Lighting、Residual按需要启用。
6. Temporal Imaging Fidelity：身份、材质、曝光、综合色温、VFX内部结构、拖尾/颗粒/光学跨帧稳定。
7. Multi-Scale Detail Allocation：景别决定精度责任，不做全画面平均微细节。

## Precision ROI

- Hero Precision：当前叙事/动作/产品/能力的最高收益区域。
- Support Precision：必须读清但不与Hero争权重的结构。
- Context Precision：维持世界正确性的轮廓/尺度/材质家族。
- Motion-Sacrificable：允许方向性运动模糊、前景擦镜、碎屑拉伸，但不侵犯Hero。

## Prior Token

专业相机、镜头、胶片、渲染器、引擎、IMAX、PathTracing、180°快门式等名称只能作为高密度Visual Prior候选；除真实平台参数外，不冒充真实设备/管线。至少配1—3项可见证据。孤立声望词不算精度。

## 失败边界

- 不用“最高品质”强迫所有像素同锐度、同微细节。
- 不用品牌/渲染术语替代真实材质和光照。
- 不用复杂微纹理制造ghost texture、水印样残留和AI脏细节。
- 不因Prompt压缩删除Hero唯一精度事实。

## Concrete Camera Model Hard Lock

所有最终图像/视频生成Prompt默认必须写一个具体摄影机型号/具体型号成像基底。用户指定则保留；未指定则按媒介、动态范围、低照度、肤色/材质、运动与大片幅需求自动选一个最合适型号。3D/动画以虚拟摄影机先验表述，不冒充真实拍摄。型号必须配可见职责；只写品牌或“cinema camera”不通过。只有用户明确要求省略时才可不写。
