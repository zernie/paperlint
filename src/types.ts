/**
 * Формы, которыми обмениваются команды CLI. До перехода на TypeScript всё это было `{}` и
 * жило в голове: опечатка в `buildScripts` читалась как «поле не задано», а не как ошибка.
 */

/** Содержимое `rpp.json` у потребителя. */
export interface RppConfig {
  /** 🔴 ОБЯЗАТЕЛЬНОЕ. Каталог(и) статей, относительно САМОГО rpp.json. */
  papers?: string | string[];
  /** Команда, печатающая список авторов из .bib — своя у каждого корпуса. */
  authorListCommand?: string;
  /** Долг типографики по статьям: сколько находок уже есть и снижать можно только вниз. */
  typographyDebt?: Record<string, Record<string, number>>;
  /** Поля фронтматтера, обязательные для заметок ревью, и допустимые значения каждого. */
  docFields?: Record<string, { values: string[] }>;
  /** Игнорировать находки ревью старше этой даты. */
  reviewSince?: string;
  /** Сколько находок должен дать холодный прочит, чтобы считаться холодным прочитом. */
  minFindings?: number;
  /** Слово, которым заметки ревью вводят причину. */
  causeMarker?: string;
  /** Какие файлы обязан нести каталог статьи; `false` выключает проверку целиком. */
  structure?: StructureConfig | false;
  /** Кандидаты в скрипт сборки, в порядке предпочтения. */
  buildScripts?: string[];
}

export interface StructureConfig {
  /** По этим файлам каталог ОПОЗНАЁТСЯ как статья. Обнаружение щедрое. */
  markers?: string[];
  /** Эти файлы обязаны быть. Требования строгие. */
  require?: string[];
  /** Хотя бы один из каждой группы. */
  requireOneOf?: string[][];
  /** Каталоги, снятые с проверки поимённо. */
  ignore?: string[];
}

/** Разобранная командная строка. */
export interface Args {
  cmd: string | null;
  paths: string[];
  config: string | null;
  json: boolean;
  all: boolean;
  dryRun: boolean;
  maxWarnings: number;
  help?: boolean;
  /** Флаг, за которым не оказалось значения. Непустое поле — это ОТКАЗ, а не умолчание. */
  missingValue?: string;
}

/** Находка о ПРИСУТСТВИИ файла — то, чего правило ESLint выразить не может. */
export interface StructureFinding {
  file: string;
  message: string;
}

/** Исход сборки одной статьи. `no-script` — ОТКАЗ, а не пропуск. */
export interface BuildResult {
  dir: string;
  status: "built" | "failed" | "no-script";
  script?: string;
  code?: number;
  dry?: boolean;
}

/** Результат чтения конфига: либо данные, либо код возврата, которым выходит вызывающий. */
export type ConfigRead =
  | { opts: RppConfig; configPath: string | null; code?: undefined }
  | { code: number; opts?: undefined; configPath?: undefined };
