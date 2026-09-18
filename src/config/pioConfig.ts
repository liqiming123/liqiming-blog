import type { Live2DWidgetConfig, SpineModelConfig } from "../types/pioConfig";

// Spine 看板娘配置
export const spineModelConfig: SpineModelConfig = {
	// Spine 看板娘开关
	enable: false,

	// Spine模型配置
	model: {
		// Spine模型文件路径
		path: "/pio/models/spine/firefly/1310.json",
		// 模型缩放比例
		scale: 1.0,
		// X轴偏移
		x: 0,
		// Y轴偏移
		y: 0,
	},

	// 位置配置
	position: {
		// 显示位置 bottom-left，bottom-right，top-left，top-right，注意：在右下角可能会挡住返回顶部按钮
		corner: "bottom-left",
		// 距离边缘0px
		offsetX: 0,
		// 距离下边缘0px
		offsetY: 0,
	},

	// 尺寸配置
	size: {
		// 容器宽度
		width: 135,
		// 容器高度
		height: 165,
	},

	// 交互配置
	interactive: {
		// 交互功能开关
		enabled: true,
		// 点击时随机播放的动画列表
		clickAnimations: [
			"emoji_0",
			"emoji_1",
			"emoji_2",
			"emoji_3",
			"emoji_4",
			"emoji_5",
		],
		// 点击时随机显示的文字消息
		clickMessages: [
			"你好呀！我是启明的看板娘~",
			"今天也要加油哦！✨",
			"想要一起去看星空吗？🌟",
			"记得要好好休息呢~",
			"有什么想对我说的吗？💫",
			"让我们一起探索未知的世界吧！🚀",
			"每一颗星星都有自己的故事~⭐",
			"希望能带给你温暖和快乐！💖",
		],
		// 文字显示时间（毫秒）
		messageDisplayTime: 3000,
		// 待机动画列表
		idleAnimations: ["idle", "emoji_0", "emoji_1", "emoji_3", "emoji_4"],
		// 待机动画切换间隔（毫秒）
		idleInterval: 8000,
	},

	// 响应式配置
	responsive: {
		// 在移动端隐藏
		hideOnMobile: true,
		// 移动端断点
		mobileBreakpoint: 768,
	},

	// 层级
	zIndex: 1000, // 层级

	// 透明度
	opacity: 1.0,
};

// Live2D 看板娘配置（复用 Mizuki 的 Pio 运行时与模型）
export const live2dWidgetConfig: Live2DWidgetConfig = {
	// Live2D 看板娘开关
	enable: true,
	// 模型配置，支持单个模型或数组（多模型切换）
	model: [
		{
			// 从 Mizuki 主题迁移的 Pio 模型
			path: "/pio/models/live2d/pio/model.json",
			// 动作声音音量 范围0~1，默认 0（静音）
			volume: 0,
			// 模型缩放比例
			scale: 1.05,
			// X轴偏移，范围 -2~2，正值向右
			x: 0,
			// Y轴偏移，范围 -2~2，正值向上
			y: 0,
		},
	],
	// 显示位置：bottom-left 或 bottom-right
	position: "bottom-left" as const,
	// 画布尺寸（px）
	size: { width: 200, height: 200 },
	// 主题色，用于菜单、状态条等 UI 元素的背景色，默认 'rgba(96,165,250,0.9)'
	primaryColor: "var(--l2d-msg-bg)",
	// 入场/退场动画时长（ms）
	transitionDuration: 1500,
	// 入场/退场动画类型
	transitionType: "slide" as const,
	// 菜单配置
	menus: {
		// 完全替换默认菜单项
		items: [
			{
				icon: "mdi:home",
				label: "返回主页",
				action: "home",
			},
			{
				icon: "mdi:arrow-up",
				label: "返回顶部",
				action: "scrollToTop",
			},
			{
				icon: "mdi:bed",
				label: "休眠",
				action: "sleep",
			},
			{
				icon: "mdi:swap-horizontal",
				label: "切换模型",
				action: "switchModel",
			},
			{
				icon: "mdi:account",
				label: "关于启明",
				action: "about",
			},
		],
		// 菜单对齐方式
		align: "right" as const,
	},
	// 提示气泡配置
	tips: {
		// 气泡开关
		enable: true,
		// 初始欢迎消息
		welcomeMessage: ["你好呀！", "欢迎来到我的世界！"],
		// 循环提示内容
		messages: [
			"有什么需要帮助的吗？",
			"今天天气真不错呢！",
			"要不要一起玩游戏？",
			"记得按时休息哦！",
		],
		// 文字显示时间（ms）
		duration: 3000,
		// 提示气泡切换间隔（ms）
		interval: 6000,
		// 位置偏移量（px），基于默认位置（模型正上方居中）进行微调
		offset: {
			x: 0, // 正值右移，负值左移
			y: 0, // 正值下移，负值上移
		},
	},
	// AI 聊天配置（点击看板娘，头顶弹出对话框）
	chat: {
		// 聊天开关
		enable: true,
		// 对话接口地址。走自建的服务端代理，不是直连第三方：
		//   浏览器 → https://liqiming.top/mascot-chat/chat/completions
		//          → OpenResty 反代 → 本机 127.0.0.1:8791（服务端代理）
		//          → https://api.deepseek.com
		// 代理负责持有 API Key、强制每日限额，服务端代码在服务器的 /opt/mascot-chat/
		// 保持 OpenAI 兼容格式，所以前端逻辑不关心后端是谁
		apiEndpoint: "https://liqiming.top/mascot-chat/chat/completions",
		// 前端**不需要**也不能填 Key：Key 只存在服务器的 /opt/mascot-chat/config.json（权限 600）。
		// 直连第三方会把 Key 烧进 HTML，任何访客都能取走并绕过本站调用，限额也就形同虚设
		apiKey: "",
		// 模型名。注意这只是前端传给代理的期望值，代理会用自己配置里的模型覆盖它
		model: "deepseek-chat",
		// 人格设定，决定看板娘怎么说话
		systemPrompt:
			"你是启明个人博客的看板娘，名字叫小明。说话亲切、活泼、简短，像朋友聊天一样，可以用颜文字和 emoji，但不要油腻。回答控制在 150 字以内，除非对方明确要求展开。遇到不确定的事就坦率说不知道，不要编造。",
		// 采样温度 0~2，越高越随机
		temperature: 0.8,
		// 单次回复最大 token 数
		maxTokens: 800,
		// SSE 流式输出，边生成边显示；关掉则等服务端一次性返回
		stream: true,
		// 同一次对话内是否把前几轮一起发给模型，保证聊得下去
		// 这些内容只活在浏览器内存里，不写 localStorage，关闭面板即清空
		keepContext: true,
		// 上行最多带几条历史消息
		maxContextMessages: 6,
		// 请求超时（ms）
		requestTimeout: 60000,
		// 界面文案与外观
		ui: {
			// 面板背景不透明度 0~1，0 = 全透明（能直接看到背后的壁纸）
			panelOpacity: 0,
			// 面板背景模糊（px），透明背景下靠它保证文字可读；设 0 则完全不模糊
			panelBlur: 10,
			// 面板宽度
			width: "19rem",
			// 面板标题
			title: "和看板娘聊聊",
			// 打开面板时的开场白
			greeting: "你好呀！我是小明，有什么想聊的都可以和我说～",
			// 输入框占位文字
			placeholder: "说点什么…",
			// 发送按钮文字
			sendLabel: "发送",
			// 等待回复时的占位文字
			loadingText: "正在思考…",
			// 请求失败时的提示文字
			errorText: "呜…我好像连不上大脑了，待会儿再试试？",
		},
	},
	// 响应式配置
	responsive: {
		// 在移动端隐藏
		hideOnMobile: true,
		// 移动端断点
		mobileBreakpoint: 768,
	},
};
