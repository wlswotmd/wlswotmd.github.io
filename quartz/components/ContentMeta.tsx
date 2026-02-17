import { Date, getDate } from "./Date"
import { QuartzComponentConstructor, QuartzComponentProps } from "./types"
import readingTime from "reading-time"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"
import { JSX } from "preact"
import style from "./styles/contentMeta.scss"
import { Element, Node, Root } from "hast"
import { toString } from "hast-util-to-string"

interface ContentMetaOptions {
  /**
   * Whether to display reading time
   */
  showReadingTime: boolean
  showComma: boolean
}

const defaultOptions: ContentMetaOptions = {
  showReadingTime: true,
  showComma: true,
}

type Lang = "en" | "ko"

const markerOnlyRegex = /^\s*\[(?:lang:)?(ko|en)\]\s*$/i
const markerPrefixRegex = /^\s*\[(?:lang:)?(ko|en)\]\s*/i

const normalizedText = (input: string): string => input.replace(/\s+/g, " ").trim()

const elementClasses = (node: Element): string[] => {
  const className = node.properties?.className
  if (Array.isArray(className)) return className.map(String)
  if (typeof className === "string") return className.split(/\s+/)
  return []
}

const extractMarkerLang = (node: Element): Lang | null => {
  const tagName = node.tagName.toLowerCase()
  if (tagName === "lang-en") return "en"
  if (tagName === "lang-ko") return "ko"

  if (tagName !== "span") return null
  const classes = elementClasses(node)
  if (!classes.includes("lang-marker")) return null

  const dataLang = String(node.properties?.["data-lang"] ?? "").toLowerCase()
  if (dataLang === "en" || dataLang === "ko") return dataLang
  return null
}

const shouldSkipForReadingTime = (node: Element): boolean => {
  const tag = node.tagName.toLowerCase()
  if (tag === "pre" || tag === "code" || tag === "script" || tag === "style") return true
  if (tag === "figure" && elementClasses(node).includes("highlight")) return true
  return false
}

const splitTextByLang = (tree: Node): { en: string; ko: string; hasMarkers: boolean } => {
  if (tree.type !== "root") {
    const plain = normalizedText(toString(tree as any))
    return { en: plain, ko: plain, hasMarkers: false }
  }

  const root = tree as Root
  let currentLang: Lang | null = null
  let hasMarkers = false
  const enParts: string[] = []
  const koParts: string[] = []

  const pushText = (text: string, lang: Lang | null) => {
    const normalized = normalizedText(text)
    if (!normalized) return

    if (!lang) {
      enParts.push(normalized)
      koParts.push(normalized)
      return
    }

    if (lang === "en") enParts.push(normalized)
    else koParts.push(normalized)
  }

  const handleTextChunk = (value: string, lang: Lang | null): Lang | null => {
    let nextLang = lang

    for (const rawLine of value.split("\n")) {
      let line = rawLine
      const trimmed = line.trim()
      if (!trimmed) continue

      const onlyMarker = trimmed.match(markerOnlyRegex)
      if (onlyMarker) {
        nextLang = onlyMarker[1].toLowerCase() as Lang
        hasMarkers = true
        continue
      }

      const prefixMarker = line.match(markerPrefixRegex)
      if (prefixMarker) {
        nextLang = prefixMarker[1].toLowerCase() as Lang
        hasMarkers = true
        line = line.replace(markerPrefixRegex, "")
      }

      pushText(line, nextLang)
    }

    return nextLang
  }

  const visit = (node: Node, lang: Lang | null): Lang | null => {
    if (node.type === "element") {
      const element = node as Element

      const markerLang = extractMarkerLang(element)
      if (markerLang) {
        hasMarkers = true
        return markerLang
      }

      if (shouldSkipForReadingTime(element)) {
        return lang
      }

      if (!("children" in element) || !Array.isArray(element.children)) {
        return lang
      }

      let nextLang = lang
      for (const child of element.children as Node[]) {
        nextLang = visit(child, nextLang)
      }
      return nextLang
    }

    if (node.type === "text") {
      const value = String((node as any).value ?? "")
      return handleTextChunk(value, lang)
    }

    if (node.type === "raw") {
      const value = String((node as any).value ?? "")
      return handleTextChunk(value, lang)
    }

    if ("children" in (node as any) && Array.isArray((node as any).children)) {
      let nextLang = lang
      for (const child of (node as any).children as Node[]) {
        nextLang = visit(child, nextLang)
      }
      return nextLang
    }

    return lang
  }

  for (const child of root.children as Node[]) {
    currentLang = visit(child, currentLang)
  }

  return {
    en: enParts.join(" "),
    ko: koParts.join(" "),
    hasMarkers,
  }
}

export default ((opts?: Partial<ContentMetaOptions>) => {
  // Merge options with defaults
  const options: ContentMetaOptions = { ...defaultOptions, ...opts }

  function ContentMetadata({ cfg, fileData, tree, displayClass }: QuartzComponentProps) {
    const text = fileData.text

    if (text) {
      const segments: (string | JSX.Element)[] = []

      if (fileData.dates) {
        segments.push(<Date date={getDate(cfg, fileData)!} locale={cfg.locale} />)
      }

      // Display reading time if enabled
      if (options.showReadingTime) {
        const split = splitTextByLang(tree)
        if (split.hasMarkers) {
          const enSource = split.en || split.ko || text
          const koSource = split.ko || split.en || text
          const enMinutes = Math.ceil(readingTime(enSource).minutes)
          const koMinutes = Math.ceil(readingTime(koSource).minutes)
          segments.push(
            <>
              <span class="lang-text" data-lang="en">
                {i18n("en-US").components.contentMeta.readingTime({ minutes: enMinutes })}
              </span>
              <span class="lang-text" data-lang="ko">
                {i18n("ko-KR").components.contentMeta.readingTime({ minutes: koMinutes })}
              </span>
            </>,
          )
        } else {
          const source = split.en || text
          const { minutes } = readingTime(source)
          const displayedTime = i18n(cfg.locale).components.contentMeta.readingTime({
            minutes: Math.ceil(minutes),
          })
          segments.push(<span>{displayedTime}</span>)
        }
      }

      return (
        <p show-comma={options.showComma} class={classNames(displayClass, "content-meta")}>
          {segments}
        </p>
      )
    } else {
      return null
    }
  }

  ContentMetadata.css = style

  return ContentMetadata
}) satisfies QuartzComponentConstructor
