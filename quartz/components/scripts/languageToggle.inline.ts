const normalizeLang = (raw?: string | null) => {
  const lower = (raw ?? "").toLowerCase()
  if (lower.startsWith("ko")) return "ko"
  if (lower.startsWith("kr")) return "ko"
  if (lower.startsWith("en")) return "en"
  return "en"
}

type Lang = "en" | "ko"

const parseTextMarker = (raw?: string | null): Lang | null => {
  const text = (raw ?? "").trim().toLowerCase()
  if (text === "[lang:ko]" || text === "[ko]") return "ko"
  if (text === "[lang:en]" || text === "[en]") return "en"
  return null
}

const textMarkerPrefixRegex = /^\s*(\[(?:lang:)?(?:ko|en)\])\s*/i
const parseTextMarkerPrefix = (raw?: string | null): { lang: Lang; marker: string } | null => {
  const text = raw ?? ""
  const match = text.match(textMarkerPrefixRegex)
  if (!match) return null

  const lang = parseTextMarker(match[1])
  if (!lang) return null
  return { lang, marker: match[1] }
}

const getLangFromMarkerElement = (el: HTMLElement): Lang | null => {
  const tagName = el.tagName.toLowerCase()
  if (tagName === "lang-ko") return "ko"
  if (tagName === "lang-en") return "en"
  if (el.tagName === "SPAN" && el.classList.contains("lang-marker")) {
    const lang = el.dataset.lang?.toLowerCase()
    if (lang === "en" || lang === "ko") return lang
  }
  return null
}

const hasRenderableContent = (nodes: Node[]) =>
  nodes.some((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) return true
    if (child.nodeType === Node.TEXT_NODE) return child.textContent?.trim()
    return false
  })

const collectPopoverHints = (scope: Document | HTMLElement = document): HTMLElement[] => {
  const nodes = Array.from(scope.querySelectorAll(".popover-hint")) as HTMLElement[]
  if (scope instanceof HTMLElement && scope.classList.contains("popover-hint")) {
    nodes.unshift(scope)
  }
  return nodes
}

const getPrimaryContent = (): HTMLElement | null =>
  (document.querySelector(".center article.popover-hint") as HTMLElement | null) ??
  (document.querySelector("article.popover-hint") as HTMLElement | null)

const getMarkerLang = (node: Node): Lang | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    return parseTextMarker(node.textContent)
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    const direct = getLangFromMarkerElement(el)
    if (direct) return direct

    if (el.tagName === "P") {
      const textMarker = parseTextMarker(el.textContent)
      if (textMarker && el.childElementCount === 0) return textMarker

      const onlyChild = el.firstElementChild
      if (onlyChild && el.childElementCount === 1 && el.textContent?.trim() === "") {
        const lang = getLangFromMarkerElement(onlyChild as HTMLElement)
        if (lang) return lang
      }
    }
  }
  return null
}

const liftParagraphMarkers = (scope: Document | HTMLElement = document) => {
  const hints = collectPopoverHints(scope)
  for (const hint of hints) {
    const paragraphs = Array.from(hint.querySelectorAll("p"))
    for (const paragraph of paragraphs) {
      const markerPrefix = parseTextMarkerPrefix(paragraph.textContent)
      if (!markerPrefix) continue

      const parent = paragraph.parentNode
      if (!parent) continue

      const boundary = document.createElement("span")
      boundary.className = "lang-marker"
      boundary.setAttribute("data-lang", markerPrefix.lang)
      parent.insertBefore(boundary, paragraph)

      const firstTextNode = Array.from(paragraph.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE,
      )
      if (firstTextNode) {
        firstTextNode.textContent = (firstTextNode.textContent ?? "").replace(
          textMarkerPrefixRegex,
          "",
        )
      } else {
        paragraph.textContent = (paragraph.textContent ?? "").replace(textMarkerPrefixRegex, "")
      }

      if (!hasRenderableContent(Array.from(paragraph.childNodes))) {
        paragraph.remove()
      }
    }

    const markers = Array.from(
      hint.querySelectorAll("lang-ko, lang-en, span.lang-marker"),
    ) as HTMLElement[]
    for (const marker of markers) {
      const lang = getLangFromMarkerElement(marker)
      if (!lang) continue

      const parent = marker.parentElement
      if (!parent || parent.tagName !== "P") continue
      const grandParent = parent.parentNode
      if (!grandParent) continue

      const boundary = document.createElement("span")
      boundary.className = "lang-marker"
      boundary.setAttribute("data-lang", lang)
      grandParent.insertBefore(boundary, parent)

      marker.remove()
      if (!hasRenderableContent(Array.from(parent.childNodes))) {
        parent.remove()
      }
    }
  }
}

const wrapLangBlocksFromMarkers = (scope: Document | HTMLElement = document) => {
  const hints = collectPopoverHints(scope)
  for (const hint of hints) {
    const containers = [hint, ...Array.from(hint.querySelectorAll("*"))]
    for (const container of containers) {
      const markerNodes: Array<{ node: Node; lang: Lang }> = []
      for (const node of Array.from(container.childNodes)) {
        const lang = getMarkerLang(node)
        if (lang) markerNodes.push({ node, lang })
      }
      if (markerNodes.length === 0) continue

      const markerSet = new Set(markerNodes.map((m) => m.node))
      for (const marker of markerNodes) {
        const markerNode = marker.node
        const parent = markerNode.parentNode
        if (!parent) continue

        const wrapper = document.createElement("section")
        wrapper.className = "lang-block"
        wrapper.setAttribute("data-lang", marker.lang)
        parent.insertBefore(wrapper, markerNode)

        let node = markerNode.nextSibling
        while (node && !markerSet.has(node)) {
          const next = node.nextSibling
          wrapper.appendChild(node)
          node = next
        }
        parent.removeChild(markerNode)

        const hasContent = hasRenderableContent(Array.from(wrapper.childNodes))
        if (!hasContent) {
          wrapper.remove()
        }
      }
    }
  }
}

const tagUnwrappedCodeBlocks = (scope: Document | HTMLElement = document) => {
  const hints = collectPopoverHints(scope)
  for (const hint of hints) {
    let currentLang: Lang | null = null
    const walker = document.createTreeWalker(hint, NodeFilter.SHOW_ELEMENT)
    let node = walker.nextNode()
    while (node) {
      const el = node as HTMLElement
      const markerLang = getMarkerLang(el)
      if (markerLang) {
        currentLang = markerLang
      } else if (el.classList.contains("lang-block")) {
        const lang = el.getAttribute("data-lang")?.toLowerCase()
        if (lang === "en" || lang === "ko") currentLang = lang
      } else if (el.tagName === "PRE") {
        if (!el.closest(".lang-block") && currentLang) {
          el.setAttribute("data-lang", currentLang)
        }
      }
      node = walker.nextNode()
    }
  }
}

const updateTocVisibility = (lang: Lang) => {
  const tocLinks = document.querySelectorAll(".toc a[data-for]")
  for (const node of tocLinks) {
    const link = node as HTMLAnchorElement
    const targetSlug = link.dataset.for
    if (!targetSlug) continue

    const target = document.getElementById(targetSlug)
    if (!target) continue

    const langBlock = target.closest(".lang-block") as HTMLElement | null
    const visible = !langBlock || langBlock.getAttribute("data-lang")?.toLowerCase() === lang

    const item = link.closest("li") as HTMLElement | null
    if (!item) continue
    item.style.display = visible ? "" : "none"
  }
}

const updateLanguage = () => {
  liftParagraphMarkers()
  wrapLangBlocksFromMarkers()
  tagUnwrappedCodeBlocks()
  const params = new URLSearchParams(window.location.search)
  const desired = normalizeLang(params.get("hl"))
  const other = desired === "en" ? "ko" : "en"

  document.documentElement.setAttribute("data-lang", desired)
  document.documentElement.setAttribute("lang", desired)
  document.documentElement.removeAttribute("data-lang-fallback")

  let fallback: "en" | "ko" | null = null
  const hasLangBlocks = document.querySelector(".lang-block") !== null
  if (hasLangBlocks) {
    const hasDesired = document.querySelector(`.lang-block[data-lang="${desired}"]`) !== null
    const hasOther = document.querySelector(`.lang-block[data-lang="${other}"]`) !== null
    if (!hasDesired && hasOther) {
      document.documentElement.setAttribute("data-lang-fallback", other)
      fallback = other
    }
  }

  const warningId = "lang-warning"
  const existingWarning = document.getElementById(warningId)
  if (!fallback) {
    existingWarning?.remove()
  } else {
    const container = getPrimaryContent()
    if (!container) {
      existingWarning?.remove()
    } else {
      const warningText =
        desired === "ko"
          ? "이 문서는 한국어 버전이 없어 영어로 표시됩니다."
          : "This post is not available in English. Showing Korean instead."
      if (existingWarning) {
        existingWarning.textContent = warningText
      } else {
        const warning = document.createElement("div")
        warning.id = warningId
        warning.className = "lang-warning"
        warning.textContent = warningText
        container.insertBefore(warning, container.firstChild)
      }
    }
  }

  updateTocVisibility(fallback ?? desired)

  for (const el of document.getElementsByClassName("language-toggle")) {
    const toggle = el as HTMLAnchorElement
    const labelEn = toggle.dataset.labelEn ?? "English"
    const labelKo = toggle.dataset.labelKo ?? "한국어"
    const nextLabel = other === "en" ? labelEn : labelKo
    const title = `Switch to ${nextLabel}`
    toggle.setAttribute("aria-label", title)
    toggle.setAttribute("title", title)

    const url = new URL(window.location.href)
    url.searchParams.set("hl", other)
    toggle.setAttribute("href", url.pathname + "?" + url.searchParams.toString() + url.hash)
  }

  for (const el of document.getElementsByClassName("search-bar")) {
    const input = el as HTMLInputElement
    const placeholder =
      desired === "ko" ? (input.dataset.placeholderKo ?? "") : (input.dataset.placeholderEn ?? "")
    if (placeholder) {
      input.placeholder = placeholder
      input.setAttribute("aria-label", placeholder)
    }
  }

  for (const el of document.getElementsByClassName("global-graph-icon")) {
    const btn = el as HTMLButtonElement
    const label = desired === "ko" ? btn.dataset.labelKo : btn.dataset.labelEn
    if (label) {
      btn.setAttribute("aria-label", label)
    }
  }

  for (const el of document.getElementsByClassName("internal")) {
    const link = el as HTMLAnchorElement
    const raw = link.dataset.canonicalHref ?? link.getAttribute("href")
    if (!raw || raw.startsWith("http")) continue
    const url = new URL(raw, window.location.href)
    url.searchParams.set("hl", desired)
    link.setAttribute("href", url.pathname + "?" + url.searchParams.toString() + url.hash)
  }
}

document.addEventListener("nav", updateLanguage)
document.addEventListener("DOMContentLoaded", updateLanguage)
document.addEventListener("language-refresh", updateLanguage)
