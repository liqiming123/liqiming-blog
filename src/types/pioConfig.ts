// Spine 看板娘配置
export type SpineModelConfig = {
	enable: boolean; // 是否启用 Spine 看板娘
	model: {
		path: string; // 模型文件路径 (.json)
		scale?: number; // 模型缩放比例，默认1.0
		x?: number; // X轴偏移，默认0
		y?: number; // Y轴偏移，默认0
	};
	position: {
		corner: "bottom-left" | "bottom-right" | "top-left" | "top-right"; // 显示位置
		offsetX?: number; // 水平偏移量，默认20px
		offsetY?: number; // 垂直偏移量，默认20px
	};
	size: {
		width?: number; // 容器宽度，默认280px
		height?: number; // 容器高度，默认400px
	};
	interactive?: {
		enabled?: boolean; // 是否启用交互功能，默认true
		clickAnimations?: string[]; // 点击时随机播放的动画列表
		clickMessages?: string[]; // 点击时随机显示的文字消息
		messageDisplayTime?: number; // 文字显示时间（毫秒），默认3000
		idleAnimations?: string[]; // 待机动画列表
		idleInterval?: number; // 待机动画切换间隔（毫秒），默认10000
	};
	responsive?: {
		hideOnMobile?: boolean; // 是否在移动端隐藏，默认false
		mobileBreakpoint?: number; // 移动端断点，默认768px
	};
	zIndex?: number; // 层级，默认1000
	opacity?: number; // 透明度，0-1，默认1.0
};

// Live2D 看板娘 AI 聊天配置
// 接口按 OpenAI 兼容格式调用（POST {apiEndpoint}，Bearer 鉴权，{model, messages, stream}），
// 因此 DeepSeek / OpenAI / 智谱 / Moonshot 以及自建的 one-api、new-api、Ollama 都能直接用。
export type Live2DChatConfig = {
	enable: boolean; // 是否启用「点击看板娘弹出聊天框」
	apiEndpoint: string; // 对话接口地址，OpenAI 兼容
	apiKey?: string; // 留空则读环境变量 PUBLIC_MASCOT_CHAT_API_KEY
	model: string; // 模型名
	systemPrompt?: string; // 人格设定，决定看板娘怎么说话
	temperature?: number; // 采样温度，默认 0.8
	maxTokens?: number; // 单次回复最大 token 数，默认 800
	stream?: boolean; // SSE 流式输出，默认 true
	keepContext?: boolean; // 同一次对话内是否把前几轮带给模型（仅内存，不落盘），默认 true
	maxContextMessages?: number; // 上行最多带几条历史消息，默认 6
	requestTimeout?: number; // 请求超时（ms），默认 60000
	ui?: {
		panelOpacity?: number; // 面板背景不透明度 0~1，0 = 全透明，默认 0
		panelBlur?: number; // 面板背景模糊（px），透明背景下靠它保证文字可读，默认 10
		width?: string; // 面板宽度，默认 "19rem"
		title?: string; // 面板标题
		greeting?: string; // 打开面板时的开场白
		placeholder?: string; // 输入框占位文字
		sendLabel?: string; // 发送按钮文字
		loadingText?: string; // 等待回复时的占位文字
		errorText?: string; // 请求失败时的提示文字
	};
};

// Live2D 看板娘配置（Pio 运行时）
export type Live2DWidgetConfig = {
	enable: boolean; // 是否启用 Live2D 看板娘
	model:
		| { path: string; volume?: number; scale?: number; x?: number; y?: number }
		| {
				path: string;
				volume?: number;
				scale?: number;
				x?: number; // X轴偏移，范围 -2~2，正值向右
				y?: number; // Y轴偏移，范围 -2~2，正值向上
		  }[]; // 模型配置，支持单个或多个模型
	position?: "bottom-left" | "bottom-right"; // 显示位置，默认 "bottom-left"
	size?: number | { width: number; height: number }; // 画布尺寸（px），默认 300
	primaryColor?: string; // 主题色，用于菜单、状态条等 UI 元素
	transitionDuration?: number; // 入场/退场动画时长（ms），默认 1500
	transitionType?: "slide" | "fade"; // 入场/退场动画类型，默认 "slide"
	menus?: {
		items?: { icon?: string; label: string; action: string }[]; // 完全替换默认菜单项
		extraItems?: { icon?: string; label: string; action: string }[]; // 追加到默认菜单末尾
		align?: "left" | "right"; // 菜单对齐方式，默认 "right"
	};
	tips?: {
		enable?: boolean; // 气泡开关，默认 true
		welcomeMessage?: string[]; // 欢迎语
		messages?: string[]; // 循环提示内容
		duration?: number; // 每条提示展示时长（ms），默认 3000
		interval?: number; // 提示循环间隔（ms），默认 5000
		offset?: { x?: number; y?: number }; // 位置偏移量（px）
		typing?: {
			param?: string; // 嘴型参数名
			speed?: number; // 打字速度（ms/字），默认 100
			minValue?: number; // 嘴型开合最小值（0-1），默认 0.5
			maxValue?: number; // 嘴型开合最大值（0-1），默认 1
		};
	};
	chat?: Live2DChatConfig; // 点击看板娘弹出的 AI 聊天配置
	responsive?: {
		hideOnMobile?: boolean; // 是否在移动端隐藏
		mobileBreakpoint?: number; // 移动端断点，默认 768
	};
};
