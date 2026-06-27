import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { Globe, ChevronDown } from "lucide-react";

// Supported languages: English + the most commonly spoken non-English languages
// in the United States. AI answers can respond in any of these; UI chrome is
// translated below. Add a language by adding an entry here plus a dictionary.
export type Lang = "en" | "es" | "zh" | "tl" | "vi";

export const LANGUAGES: { code: Lang; label: string; english: string }[] = [
  { code: "en", label: "English", english: "English" },
  { code: "es", label: "Español", english: "Spanish" },
  { code: "zh", label: "中文", english: "Chinese" },
  { code: "tl", label: "Tagalog", english: "Tagalog" },
  { code: "vi", label: "Tiếng Việt", english: "Vietnamese" },
];

export function englishName(code: Lang): string {
  return LANGUAGES.find((l) => l.code === code)?.english || "English";
}

type Dict = Record<string, string>;

const en: Dict = {
  "nav.coach": "Coach",
  "nav.library": "Library",
  "nav.progress": "Progress",
  "nav.cohorts": "Cohorts",
  "nav.settings": "Settings",
  "nav.admin": "Admin",
  "nav.signout": "Sign out",
  "common.language": "Language",

  "landing.signin": "Sign In",
  "landing.start": "Start",
  "landing.startCoaching": "Start Coaching",
  "landing.heroTitle": "A premium study coach, in your pocket.",
  "landing.heroSubtitle":
    "Prepare for professional certifications and high-stakes tests - TOEFL, ESL, MCAT, GRE, PMP, ACCA and more - with a private tutor that adapts to you. Choose your coach personality, master concepts, and pass.",
  "landing.p.drill.title": "Drill Sergeant",
  "landing.p.drill.desc": "Relentless testing, high expectations, zero fluff. For when you need pushing.",
  "landing.p.socratic.title": "Socratic Mentor",
  "landing.p.socratic.desc": "Answers questions with questions. Deepens foundational understanding.",
  "landing.p.warm.title": "Warm Encourager",
  "landing.p.warm.desc": "Supportive, patient, focuses on small wins and building confidence.",
  "landing.p.analyst.title": "Strategic Analyst",
  "landing.p.analyst.desc": "Focuses on efficiency, probability, and high-yield topics.",
  "landing.cta": "Begin Your Assessment",

  "set.subtitle": "Manage your profile and coaching preferences.",
  "set.goals.title": "Study Goals",
  "set.goals.desc": "What are you preparing for?",
  "set.goal.label": "Primary Goal",
  "set.goal.ph": "Select goal",
  "set.goal.cert": "Professional Certification",
  "set.goal.university": "University Course",
  "set.goal.general": "General Study",
  "set.examDate": "Exam Date (Optional)",
  "set.hours": "Study Hours per Week",
  "set.persona.title": "Coach Persona",
  "set.persona.desc": "Change how your coach communicates with you.",
  "set.persona.ph": "Select personality",
  "set.persona.drill": "Drill Sergeant (Direct, challenging, testing-focused)",
  "set.persona.socratic": "Socratic Mentor (Questioning, foundational, deep)",
  "set.persona.warm": "Warm Encourager (Supportive, patient, confidence-building)",
  "set.persona.analyst": "Strategic Analyst (Efficient, high-yield, probability-focused)",
  "set.save": "Save Changes",
  "set.savedTitle": "Settings saved",
  "set.savedDesc": "Your profile has been updated.",
  "set.errTitle": "Error",
  "set.errDesc": "Failed to save settings.",
  "set.lang.title": "Language",
  "set.lang.desc": "Choose the language for the app and your coach.",

  "common.cancel": "Cancel",
  "coach.tutorFallback": "Your Tutor",
  "coach.todayPlan": "Today's Plan",
  "coach.est": "Est. 45m",
  "coach.planPlaceholder": "Focus on retaining recent foundations.",
  "coach.beginSession": "Begin Session",
  "coach.inputPlaceholder": "Talk to your coach...",
  "mat.subtitle": "Your extracted concepts and study material.",
  "mat.add": "Add Material",
  "mat.addShort": "Add",
  "mat.dialogTitle": "Add New Material",
  "mat.paste": "Paste Text",
  "mat.pasteShort": "Paste",
  "mat.url": "Web URL",
  "mat.urlShort": "URL",
  "mat.file": "Upload File",
  "mat.fileShort": "File",
  "mat.pastePh": "Paste notes, lecture transcripts, or textbook excerpts...",
  "mat.choose": "Click to choose a file",
  "mat.fileHint": "PDF, Word, PowerPoint, text, or images (up to 100MB)",
  "mat.mbSelected": "MB selected",
  "mat.processing": "Processing",
  "mat.extract": "Extract Concepts",
  "mat.deleteConfirm": "Are you sure you want to delete this concept?",
  "mat.emptyTitle": "Your library is empty",
  "mat.emptyDesc": "Add text, links, or files, and the coach will extract core concepts, definitions, and mental models for you to master.",
  "mat.emptyCta": "Add your first material",
  "mat.due": "Due",
  "mat.uploadFail": "Upload failed. Please try again.",
  "prog.title": "Progress & Readiness",
  "prog.subtitle": "Track your mastery and exam readiness.",
  "prog.streak": "Current Streak",
  "prog.days": "days",
  "prog.readiness": "Readiness",
  "prog.examIn": "Exam In",
  "prog.tbd": "TBD",
  "prog.mastered": "Mastered",
  "prog.distTitle": "Mastery Distribution",
  "prog.distDesc": "How well you know your library concepts",
  "prog.reviewing": "Reviewing",
  "prog.learning": "Learning",
  "prog.new": "New",
  "prog.retroTitle": "Weekly Retrospectives",
  "prog.genRetro": "Generate Retro",
  "prog.retroEmpty": "No retrospectives yet. Complete some checkpoints and generate your first retro.",
  "prog.weekOf": "Week of",

  "asmt.title": "Initial Assessment",
  "asmt.subtitle": "Let's find the right coaching approach for you.",
  "asmt.welcome": "Welcome. Let's find out where you stand and what kind of coaching will serve you best. What are you preparing for?",
  "asmt.inputPlaceholder": "Type your response...",
};

const es: Dict = {
  "nav.coach": "Entrenador",
  "nav.library": "Biblioteca",
  "nav.progress": "Progreso",
  "nav.settings": "Ajustes",
  "nav.admin": "Administración",
  "nav.signout": "Cerrar sesión",
  "common.language": "Idioma",

  "landing.signin": "Iniciar sesión",
  "landing.start": "Empezar",
  "landing.startCoaching": "Empezar a estudiar",
  "landing.heroTitle": "Un entrenador de estudio premium, en tu bolsillo.",
  "landing.heroSubtitle":
    "Prepárate para certificaciones profesionales y exámenes de alto riesgo (TOEFL, ESL, MCAT, GRE, PMP, ACCA y más) con un tutor privado que se adapta a ti. Elige la personalidad de tu entrenador, domina los conceptos y aprueba.",
  "landing.p.drill.title": "Sargento Instructor",
  "landing.p.drill.desc": "Práctica constante, expectativas altas, sin rodeos. Para cuando necesitas que te exijan.",
  "landing.p.socratic.title": "Mentor Socrático",
  "landing.p.socratic.desc": "Responde con preguntas. Profundiza la comprensión de los fundamentos.",
  "landing.p.warm.title": "Apoyo Cercano",
  "landing.p.warm.desc": "Comprensivo y paciente; se enfoca en pequeños logros y en generar confianza.",
  "landing.p.analyst.title": "Analista Estratégico",
  "landing.p.analyst.desc": "Se enfoca en la eficiencia, la probabilidad y los temas de mayor rendimiento.",
  "landing.cta": "Comienza tu evaluación",

  "set.subtitle": "Administra tu perfil y tus preferencias de estudio.",
  "set.goals.title": "Objetivos de estudio",
  "set.goals.desc": "¿Para qué te estás preparando?",
  "set.goal.label": "Objetivo principal",
  "set.goal.ph": "Selecciona un objetivo",
  "set.goal.cert": "Certificación profesional",
  "set.goal.university": "Curso universitario",
  "set.goal.general": "Estudio general",
  "set.examDate": "Fecha del examen (opcional)",
  "set.hours": "Horas de estudio por semana",
  "set.persona.title": "Personalidad del entrenador",
  "set.persona.desc": "Cambia la forma en que tu entrenador se comunica contigo.",
  "set.persona.ph": "Selecciona una personalidad",
  "set.persona.drill": "Sargento Instructor (directo, exigente, centrado en evaluar)",
  "set.persona.socratic": "Mentor Socrático (con preguntas, fundamental, profundo)",
  "set.persona.warm": "Apoyo Cercano (comprensivo, paciente, genera confianza)",
  "set.persona.analyst": "Analista Estratégico (eficiente, alto rendimiento, enfocado en probabilidades)",
  "set.save": "Guardar cambios",
  "set.savedTitle": "Ajustes guardados",
  "set.savedDesc": "Tu perfil se ha actualizado.",
  "set.errTitle": "Error",
  "set.errDesc": "No se pudieron guardar los ajustes.",
  "set.lang.title": "Idioma",
  "set.lang.desc": "Elige el idioma de la aplicación y de tu entrenador.",

  "common.cancel": "Cancelar",
  "coach.tutorFallback": "Tu tutor",
  "coach.todayPlan": "Plan de hoy",
  "coach.est": "Aprox. 45 min",
  "coach.planPlaceholder": "Enfócate en retener las bases recientes.",
  "coach.beginSession": "Comenzar sesión",
  "coach.inputPlaceholder": "Habla con tu entrenador...",
  "mat.subtitle": "Tus conceptos extraídos y material de estudio.",
  "mat.add": "Agregar material",
  "mat.addShort": "Agregar",
  "mat.dialogTitle": "Agregar nuevo material",
  "mat.paste": "Pegar texto",
  "mat.pasteShort": "Pegar",
  "mat.url": "Enlace web",
  "mat.urlShort": "Enlace",
  "mat.file": "Subir archivo",
  "mat.fileShort": "Archivo",
  "mat.pastePh": "Pega apuntes, transcripciones de clases o fragmentos de libros...",
  "mat.choose": "Haz clic para elegir un archivo",
  "mat.fileHint": "PDF, Word, PowerPoint, texto o imágenes (hasta 100 MB)",
  "mat.mbSelected": "MB seleccionados",
  "mat.processing": "Procesando",
  "mat.extract": "Extraer conceptos",
  "mat.deleteConfirm": "¿Seguro que quieres eliminar este concepto?",
  "mat.emptyTitle": "Tu biblioteca está vacía",
  "mat.emptyDesc": "Agrega texto, enlaces o archivos y el entrenador extraerá conceptos clave, definiciones y modelos mentales para que los domines.",
  "mat.emptyCta": "Agrega tu primer material",
  "mat.due": "Para",
  "mat.uploadFail": "No se pudo subir. Inténtalo de nuevo.",
  "prog.title": "Progreso y preparación",
  "prog.subtitle": "Sigue tu dominio y tu preparación para el examen.",
  "prog.streak": "Racha actual",
  "prog.days": "días",
  "prog.readiness": "Preparación",
  "prog.examIn": "Examen en",
  "prog.tbd": "Por definir",
  "prog.mastered": "Dominado",
  "prog.distTitle": "Distribución del dominio",
  "prog.distDesc": "Qué tan bien conoces los conceptos de tu biblioteca",
  "prog.reviewing": "Repasando",
  "prog.learning": "Aprendiendo",
  "prog.new": "Nuevo",
  "prog.retroTitle": "Retrospectivas semanales",
  "prog.genRetro": "Generar retrospectiva",
  "prog.retroEmpty": "Aún no hay retrospectivas. Completa algunos puntos de control y genera la primera.",
  "prog.weekOf": "Semana del",

  "asmt.title": "Evaluación inicial",
  "asmt.subtitle": "Encontremos el enfoque de entrenamiento adecuado para ti.",
  "asmt.welcome": "Bienvenida. Vamos a descubrir en qué punto estás y qué tipo de entrenamiento te servirá mejor. ¿Para qué te estás preparando?",
  "asmt.inputPlaceholder": "Escribe tu respuesta...",
};

const zh: Dict = {
  "nav.coach": "教练",
  "nav.library": "资料库",
  "nav.progress": "进度",
  "nav.settings": "设置",
  "nav.admin": "管理",
  "nav.signout": "退出登录",
  "common.language": "语言",

  "landing.signin": "登录",
  "landing.start": "开始",
  "landing.startCoaching": "开始辅导",
  "landing.heroTitle": "随身携带的高级学习教练。",
  "landing.heroSubtitle":
    "在能适应你的私人导师陪伴下，备考专业认证和重要考试（TOEFL、ESL、MCAT、GRE、PMP、ACCA 等）。选择你的教练风格，掌握知识点，顺利通过。",
  "landing.p.drill.title": "严格教官",
  "landing.p.drill.desc": "持续测验、高要求、不啰嗦。适合需要被督促的人。",
  "landing.p.socratic.title": "苏格拉底式导师",
  "landing.p.socratic.desc": "用提问来回答问题，加深对基础的理解。",
  "landing.p.warm.title": "温暖鼓励者",
  "landing.p.warm.desc": "支持、有耐心，专注于小成就并建立信心。",
  "landing.p.analyst.title": "策略分析师",
  "landing.p.analyst.desc": "注重效率、概率和高分值的主题。",
  "landing.cta": "开始你的评估",

  "set.subtitle": "管理你的个人资料和学习偏好。",
  "set.goals.title": "学习目标",
  "set.goals.desc": "你在为什么做准备？",
  "set.goal.label": "主要目标",
  "set.goal.ph": "选择目标",
  "set.goal.cert": "专业认证",
  "set.goal.university": "大学课程",
  "set.goal.general": "一般学习",
  "set.examDate": "考试日期（可选）",
  "set.hours": "每周学习小时数",
  "set.persona.title": "教练风格",
  "set.persona.desc": "更改教练与你沟通的方式。",
  "set.persona.ph": "选择风格",
  "set.persona.drill": "严格教官（直接、高要求、注重测验）",
  "set.persona.socratic": "苏格拉底式导师（善用提问、重基础、深入）",
  "set.persona.warm": "温暖鼓励者（支持、耐心、建立信心）",
  "set.persona.analyst": "策略分析师（高效、高分值、注重概率）",
  "set.save": "保存更改",
  "set.savedTitle": "设置已保存",
  "set.savedDesc": "你的个人资料已更新。",
  "set.errTitle": "错误",
  "set.errDesc": "无法保存设置。",
  "set.lang.title": "语言",
  "set.lang.desc": "选择应用和教练使用的语言。",

  "common.cancel": "取消",
  "coach.tutorFallback": "你的导师",
  "coach.todayPlan": "今日计划",
  "coach.est": "约 45 分钟",
  "coach.planPlaceholder": "专注于巩固最近的基础内容。",
  "coach.beginSession": "开始学习",
  "coach.inputPlaceholder": "和你的教练聊聊……",
  "mat.subtitle": "你提取的知识点和学习资料。",
  "mat.add": "添加资料",
  "mat.addShort": "添加",
  "mat.dialogTitle": "添加新资料",
  "mat.paste": "粘贴文本",
  "mat.pasteShort": "粘贴",
  "mat.url": "网页链接",
  "mat.urlShort": "链接",
  "mat.file": "上传文件",
  "mat.fileShort": "文件",
  "mat.pastePh": "粘贴笔记、课堂记录或教材摘录……",
  "mat.choose": "点击选择文件",
  "mat.fileHint": "PDF、Word、PowerPoint、文本或图片（最大 100MB）",
  "mat.mbSelected": "MB 已选择",
  "mat.processing": "处理中",
  "mat.extract": "提取知识点",
  "mat.deleteConfirm": "确定要删除这个知识点吗？",
  "mat.emptyTitle": "你的资料库是空的",
  "mat.emptyDesc": "添加文本、链接或文件，教练会为你提取核心概念、定义和思维模型，帮助你掌握。",
  "mat.emptyCta": "添加你的第一份资料",
  "mat.due": "到期",
  "mat.uploadFail": "上传失败，请重试。",
  "prog.title": "进度与备考情况",
  "prog.subtitle": "跟踪你的掌握程度和备考情况。",
  "prog.streak": "当前连续天数",
  "prog.days": "天",
  "prog.readiness": "备考程度",
  "prog.examIn": "距考试",
  "prog.tbd": "待定",
  "prog.mastered": "已掌握",
  "prog.distTitle": "掌握分布",
  "prog.distDesc": "你对资料库中知识点的掌握程度",
  "prog.reviewing": "复习中",
  "prog.learning": "学习中",
  "prog.new": "新内容",
  "prog.retroTitle": "每周回顾",
  "prog.genRetro": "生成回顾",
  "prog.retroEmpty": "还没有回顾。完成一些检查点后生成你的第一份回顾。",
  "prog.weekOf": "本周起始于",

  "asmt.title": "初始评估",
  "asmt.subtitle": "让我们找到最适合你的辅导方式。",
  "asmt.welcome": "欢迎。我们来了解一下你目前的水平，以及哪种辅导方式最适合你。你在为什么做准备？",
  "asmt.inputPlaceholder": "输入你的回答……",
};

const tl: Dict = {
  "nav.coach": "Coach",
  "nav.library": "Aklatan",
  "nav.progress": "Progreso",
  "nav.settings": "Mga Setting",
  "nav.admin": "Admin",
  "nav.signout": "Mag-sign out",
  "common.language": "Wika",

  "landing.signin": "Mag-sign in",
  "landing.start": "Simulan",
  "landing.startCoaching": "Simulan ang Coaching",
  "landing.heroTitle": "Isang premium na study coach, nasa bulsa mo.",
  "landing.heroSubtitle":
    "Maghanda para sa mga propesyonal na sertipikasyon at mahahalagang pagsusulit - TOEFL, ESL, MCAT, GRE, PMP, ACCA at iba pa - kasama ang pribadong tutor na umaangkop sa iyo. Piliin ang personalidad ng iyong coach, masteryahin ang mga konsepto, at pumasa.",
  "landing.p.drill.title": "Mahigpit na Coach",
  "landing.p.drill.desc": "Tuloy-tuloy na pagsubok, mataas na inaasahan, walang palabok. Para kapag kailangan mong itulak.",
  "landing.p.socratic.title": "Socratic na Tagapayo",
  "landing.p.socratic.desc": "Sumasagot ng tanong sa pamamagitan ng tanong. Pinalalalim ang pang-unawa sa pundasyon.",
  "landing.p.warm.title": "Mainit na Tagahikayat",
  "landing.p.warm.desc": "Mapagsuporta, matiyaga, nakatuon sa maliliit na tagumpay at pagbuo ng tiwala.",
  "landing.p.analyst.title": "Strategic na Analyst",
  "landing.p.analyst.desc": "Nakatuon sa kahusayan, posibilidad, at mga paksang may mataas na halaga.",
  "landing.cta": "Simulan ang iyong Pagtatasa",

  "set.subtitle": "Pamahalaan ang iyong profile at mga kagustuhan sa pag-aaral.",
  "set.goals.title": "Mga Layunin sa Pag-aaral",
  "set.goals.desc": "Para saan ka naghahanda?",
  "set.goal.label": "Pangunahing Layunin",
  "set.goal.ph": "Pumili ng layunin",
  "set.goal.cert": "Propesyonal na Sertipikasyon",
  "set.goal.university": "Kurso sa Unibersidad",
  "set.goal.general": "Pangkalahatang Pag-aaral",
  "set.examDate": "Petsa ng Pagsusulit (Opsyonal)",
  "set.hours": "Oras ng Pag-aaral kada Linggo",
  "set.persona.title": "Personalidad ng Coach",
  "set.persona.desc": "Baguhin kung paano nakikipag-usap sa iyo ang iyong coach.",
  "set.persona.ph": "Pumili ng personalidad",
  "set.persona.drill": "Mahigpit na Coach (diretso, mapaghamon, nakatuon sa pagsubok)",
  "set.persona.socratic": "Socratic na Tagapayo (nagtatanong, pundasyon, malalim)",
  "set.persona.warm": "Mainit na Tagahikayat (mapagsuporta, matiyaga, nagpapatibay ng tiwala)",
  "set.persona.analyst": "Strategic na Analyst (mahusay, mataas ang halaga, nakatuon sa posibilidad)",
  "set.save": "I-save ang mga Pagbabago",
  "set.savedTitle": "Na-save ang mga setting",
  "set.savedDesc": "Na-update na ang iyong profile.",
  "set.errTitle": "Error",
  "set.errDesc": "Hindi na-save ang mga setting.",
  "set.lang.title": "Wika",
  "set.lang.desc": "Piliin ang wika para sa app at sa iyong coach.",

  "common.cancel": "Kanselahin",
  "coach.tutorFallback": "Ang iyong Tutor",
  "coach.todayPlan": "Plano Ngayon",
  "coach.est": "Tinatayang 45 min",
  "coach.planPlaceholder": "Magtuon sa pagpapanatili ng mga kamakailang pundasyon.",
  "coach.beginSession": "Simulan ang Sesyon",
  "coach.inputPlaceholder": "Makipag-usap sa iyong coach...",
  "mat.subtitle": "Ang iyong mga konseptong nakuha at materyal sa pag-aaral.",
  "mat.add": "Magdagdag ng Materyal",
  "mat.addShort": "Magdagdag",
  "mat.dialogTitle": "Magdagdag ng Bagong Materyal",
  "mat.paste": "I-paste ang Teksto",
  "mat.pasteShort": "I-paste",
  "mat.url": "Web URL",
  "mat.urlShort": "URL",
  "mat.file": "Mag-upload ng File",
  "mat.fileShort": "File",
  "mat.pastePh": "I-paste ang mga tala, transcript ng lecture, o sipi mula sa aklat...",
  "mat.choose": "I-click para pumili ng file",
  "mat.fileHint": "PDF, Word, PowerPoint, teksto, o mga larawan (hanggang 100MB)",
  "mat.mbSelected": "MB ang napili",
  "mat.processing": "Pinoproseso",
  "mat.extract": "Kunin ang mga Konsepto",
  "mat.deleteConfirm": "Sigurado ka bang gusto mong tanggalin ang konseptong ito?",
  "mat.emptyTitle": "Walang laman ang iyong aklatan",
  "mat.emptyDesc": "Magdagdag ng teksto, link, o file, at kukunin ng coach ang mga pangunahing konsepto, depinisyon, at mental model para mamaster mo.",
  "mat.emptyCta": "Idagdag ang iyong unang materyal",
  "mat.due": "Takdang",
  "mat.uploadFail": "Hindi na-upload. Pakisubukan muli.",
  "prog.title": "Progreso at Kahandaan",
  "prog.subtitle": "Subaybayan ang iyong kahusayan at kahandaan sa pagsusulit.",
  "prog.streak": "Kasalukuyang Streak",
  "prog.days": "araw",
  "prog.readiness": "Kahandaan",
  "prog.examIn": "Pagsusulit sa",
  "prog.tbd": "Hindi pa tiyak",
  "prog.mastered": "Namaster",
  "prog.distTitle": "Distribusyon ng Kahusayan",
  "prog.distDesc": "Kung gaano mo kakilala ang mga konsepto sa iyong aklatan",
  "prog.reviewing": "Nirerepaso",
  "prog.learning": "Natututo",
  "prog.new": "Bago",
  "prog.retroTitle": "Lingguhang Retrospektibo",
  "prog.genRetro": "Gumawa ng Retro",
  "prog.retroEmpty": "Wala pang retrospektibo. Tapusin ang ilang checkpoint at gumawa ng iyong una.",
  "prog.weekOf": "Linggo ng",

  "asmt.title": "Paunang Pagtatasa",
  "asmt.subtitle": "Hanapin natin ang tamang paraan ng coaching para sa iyo.",
  "asmt.welcome": "Maligayang pagdating. Alamin natin kung nasaan ka na at kung anong uri ng coaching ang pinakamabuti para sa iyo. Para saan ka naghahanda?",
  "asmt.inputPlaceholder": "I-type ang iyong sagot...",
};

const vi: Dict = {
  "nav.coach": "Huấn luyện viên",
  "nav.library": "Thư viện",
  "nav.progress": "Tiến độ",
  "nav.settings": "Cài đặt",
  "nav.admin": "Quản trị",
  "nav.signout": "Đăng xuất",
  "common.language": "Ngôn ngữ",

  "landing.signin": "Đăng nhập",
  "landing.start": "Bắt đầu",
  "landing.startCoaching": "Bắt đầu học",
  "landing.heroTitle": "Một huấn luyện viên học tập cao cấp, ngay trong túi bạn.",
  "landing.heroSubtitle":
    "Chuẩn bị cho các chứng chỉ nghề nghiệp và kỳ thi quan trọng - TOEFL, ESL, MCAT, GRE, PMP, ACCA và nhiều hơn nữa - cùng một gia sư riêng biết thích ứng với bạn. Chọn phong cách huấn luyện viên, nắm vững kiến thức và vượt qua.",
  "landing.p.drill.title": "Huấn luyện viên nghiêm khắc",
  "landing.p.drill.desc": "Kiểm tra liên tục, kỳ vọng cao, không vòng vo. Dành cho khi bạn cần được thúc đẩy.",
  "landing.p.socratic.title": "Người cố vấn Socrates",
  "landing.p.socratic.desc": "Trả lời câu hỏi bằng câu hỏi. Đào sâu hiểu biết nền tảng.",
  "landing.p.warm.title": "Người động viên ấm áp",
  "landing.p.warm.desc": "Hỗ trợ, kiên nhẫn, tập trung vào những thành công nhỏ và xây dựng sự tự tin.",
  "landing.p.analyst.title": "Nhà phân tích chiến lược",
  "landing.p.analyst.desc": "Tập trung vào hiệu quả, xác suất và các chủ đề có giá trị cao.",
  "landing.cta": "Bắt đầu đánh giá của bạn",

  "set.subtitle": "Quản lý hồ sơ và tùy chọn học tập của bạn.",
  "set.goals.title": "Mục tiêu học tập",
  "set.goals.desc": "Bạn đang chuẩn bị cho điều gì?",
  "set.goal.label": "Mục tiêu chính",
  "set.goal.ph": "Chọn mục tiêu",
  "set.goal.cert": "Chứng chỉ nghề nghiệp",
  "set.goal.university": "Khóa học đại học",
  "set.goal.general": "Học tổng quát",
  "set.examDate": "Ngày thi (không bắt buộc)",
  "set.hours": "Số giờ học mỗi tuần",
  "set.persona.title": "Phong cách huấn luyện viên",
  "set.persona.desc": "Thay đổi cách huấn luyện viên giao tiếp với bạn.",
  "set.persona.ph": "Chọn phong cách",
  "set.persona.drill": "Huấn luyện viên nghiêm khắc (thẳng thắn, đòi hỏi cao, tập trung kiểm tra)",
  "set.persona.socratic": "Người cố vấn Socrates (đặt câu hỏi, nền tảng, chuyên sâu)",
  "set.persona.warm": "Người động viên ấm áp (hỗ trợ, kiên nhẫn, xây dựng sự tự tin)",
  "set.persona.analyst": "Nhà phân tích chiến lược (hiệu quả, giá trị cao, tập trung vào xác suất)",
  "set.save": "Lưu thay đổi",
  "set.savedTitle": "Đã lưu cài đặt",
  "set.savedDesc": "Hồ sơ của bạn đã được cập nhật.",
  "set.errTitle": "Lỗi",
  "set.errDesc": "Không lưu được cài đặt.",
  "set.lang.title": "Ngôn ngữ",
  "set.lang.desc": "Chọn ngôn ngữ cho ứng dụng và huấn luyện viên của bạn.",

  "common.cancel": "Hủy",
  "coach.tutorFallback": "Gia sư của bạn",
  "coach.todayPlan": "Kế hoạch hôm nay",
  "coach.est": "Khoảng 45 phút",
  "coach.planPlaceholder": "Tập trung củng cố những kiến thức nền tảng gần đây.",
  "coach.beginSession": "Bắt đầu buổi học",
  "coach.inputPlaceholder": "Trò chuyện với huấn luyện viên của bạn...",
  "mat.subtitle": "Các khái niệm đã trích xuất và tài liệu học của bạn.",
  "mat.add": "Thêm tài liệu",
  "mat.addShort": "Thêm",
  "mat.dialogTitle": "Thêm tài liệu mới",
  "mat.paste": "Dán văn bản",
  "mat.pasteShort": "Dán",
  "mat.url": "Liên kết web",
  "mat.urlShort": "Liên kết",
  "mat.file": "Tải tệp lên",
  "mat.fileShort": "Tệp",
  "mat.pastePh": "Dán ghi chú, bản ghi bài giảng hoặc trích đoạn sách giáo khoa...",
  "mat.choose": "Nhấn để chọn tệp",
  "mat.fileHint": "PDF, Word, PowerPoint, văn bản hoặc hình ảnh (tối đa 100MB)",
  "mat.mbSelected": "MB đã chọn",
  "mat.processing": "Đang xử lý",
  "mat.extract": "Trích xuất khái niệm",
  "mat.deleteConfirm": "Bạn có chắc muốn xóa khái niệm này không?",
  "mat.emptyTitle": "Thư viện của bạn đang trống",
  "mat.emptyDesc": "Thêm văn bản, liên kết hoặc tệp, và huấn luyện viên sẽ trích xuất các khái niệm cốt lõi, định nghĩa và mô hình tư duy để bạn nắm vững.",
  "mat.emptyCta": "Thêm tài liệu đầu tiên của bạn",
  "mat.due": "Hạn",
  "mat.uploadFail": "Tải lên thất bại. Vui lòng thử lại.",
  "prog.title": "Tiến độ và mức sẵn sàng",
  "prog.subtitle": "Theo dõi mức độ thành thạo và sự sẵn sàng cho kỳ thi của bạn.",
  "prog.streak": "Chuỗi ngày hiện tại",
  "prog.days": "ngày",
  "prog.readiness": "Mức sẵn sàng",
  "prog.examIn": "Kỳ thi sau",
  "prog.tbd": "Chưa xác định",
  "prog.mastered": "Đã thành thạo",
  "prog.distTitle": "Phân bố mức thành thạo",
  "prog.distDesc": "Mức độ bạn hiểu các khái niệm trong thư viện",
  "prog.reviewing": "Đang ôn lại",
  "prog.learning": "Đang học",
  "prog.new": "Mới",
  "prog.retroTitle": "Hồi cứu hằng tuần",
  "prog.genRetro": "Tạo hồi cứu",
  "prog.retroEmpty": "Chưa có hồi cứu nào. Hãy hoàn thành một số điểm kiểm tra và tạo bản đầu tiên.",
  "prog.weekOf": "Tuần của",
  "asmt.title": "Đánh giá ban đầu",
  "asmt.subtitle": "Hãy cùng tìm phương pháp huấn luyện phù hợp với bạn.",
  "asmt.welcome": "Chào mừng bạn. Hãy cùng tìm hiểu bạn đang ở đâu và kiểu huấn luyện nào phù hợp nhất với bạn. Bạn đang chuẩn bị cho điều gì?",
  "asmt.inputPlaceholder": "Nhập câu trả lời của bạn...",
};

const translations: Record<Lang, Dict> = { en, es, zh, tl, vi };

type LangContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
};

const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key, fallback) => fallback ?? key,
});

const STORAGE_KEY = "coach_lang";

function readStoredLang(): Lang {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s && LANGUAGES.some((l) => l.code === s)) return s as Lang;
  } catch {
    /* ignore */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    // Also store as a cookie so the server can tailor AI replies (the coach) to this language.
    try {
      document.cookie = `${STORAGE_KEY}=${l}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      // Keep the cookie in sync so the server (coach AI) always sees the current language.
      try {
        document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        /* ignore */
      }
    }
  }, [lang]);

  const t = (key: string, fallback?: string) =>
    translations[lang][key] ?? translations.en[key] ?? fallback ?? key;

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext);
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <div className={"relative inline-flex items-center " + className}>
      <Globe className="w-4 h-4 text-muted-foreground pointer-events-none absolute left-2.5" />
      <select
        aria-label={t("common.language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="appearance-none rounded-md border border-border bg-background pl-8 pr-7 py-1.5 text-sm text-foreground hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground pointer-events-none absolute right-2" />
    </div>
  );
}
