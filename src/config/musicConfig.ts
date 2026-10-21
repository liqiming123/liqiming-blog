import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: true,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	// 当前用 local 模式 + 网易接口直链：local.playlist 的 url 字段支持完整 URL，
	// 直接填 Meting API 的单曲地址即可——既不往仓库/服务器存音频文件，
	// 又能精确控制列表只有这 10 首（meting 模式会整张歌单拉进来，没法挑）。
	// 注意：商业版权歌曲走公开接口只有 30 秒试听片段（平台规则，非 bug）。
	// 音频 https://api.injahow.cn/meting/?server=netease&type=url&id=<歌曲ID>
	// 封面 https://api.injahow.cn/meting/?server=netease&type=pic&id=<封面ID>
	// 换歌只需替换 id；主题会自动对每个 meting 链接生成备用源，主接口挂了自动切换
	mode: "local",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: false,

	// Meting API 配置（当前 mode=local，此段不生效，保留备用）
	meting: {
		api: "https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
		server: "netease",
		type: "playlist",
		id: "440999611",
		auth: "",
		fallbackApis: [
			"https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 10 首高热动漫主题曲，全部经网易云接口解析（30 秒试听）
	local: {
		playlist: [
			{
				name: "紅蓮華（鬼灭之刃）",
				artist: "LiSA",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=1360592706",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951166199033558",
				lrc: "",
			},
			{
				name: "前前前世（你的名字。）",
				artist: "RADWIMPS",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=426881487",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951171836647530",
				lrc: "",
			},
			{
				name: "unravel（东京喰种）",
				artist: "TK from 凛として時雨",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=29017078",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951169033080950",
				lrc: "",
			},
			{
				name: "ブルーバード 青鸟（火影忍者）",
				artist: "いきものがかり",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=718765",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951166200194461",
				lrc: "",
			},
			{
				name: "勇者（葬送的芙莉莲）",
				artist: "YOASOBI",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=2083182016",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951168924619987",
				lrc: "",
			},
			{
				name: "SPECIALZ（咒术回战）",
				artist: "King Gnu",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=2074163984",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951168848035270",
				lrc: "",
			},
			{
				name: "残酷な天使のテーゼ（EVA）",
				artist: "高橋洋子",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=657666",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951172618401349",
				lrc: "",
			},
			{
				name: "only my railgun（某科学的超电磁炮）",
				artist: "fripSide",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=725692",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951171943110642",
				lrc: "",
			},
			{
				name: "βios（罪恶王冠）",
				artist: "小林未郁",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=498096",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951166197895701",
				lrc: "",
			},
			{
				name: "aLIEz（Aldnoah.Zero）",
				artist: "SawanoHiroyuki[nZk]mizuki",
				url: "https://api.injahow.cn/meting/?server=netease&type=url&id=29307041",
				cover:
					"https://api.injahow.cn/meting/?server=netease&type=pic&id=109951167842313044",
				lrc: "",
			},
		],
	},
};
