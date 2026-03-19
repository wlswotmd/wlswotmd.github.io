// @ts-ignore
import languageToggleScript from "./scripts/languageToggle.inline"
import styles from "./styles/languageToggle.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

const LanguageToggle: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
  const title = "Toggle language"

  return (
    <a
      class={classNames(displayClass, "language-toggle")}
      href="?hl=ko"
      aria-label={title}
      title={title}
      data-label-en="English"
      data-label-ko="한국어"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="languageIcon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12h17" />
        <path d="M12 3.5c2.6 2.4 4 5.4 4 8.5s-1.4 6.1-4 8.5" />
        <path d="M12 3.5c-2.6 2.4-4 5.4-4 8.5s1.4 6.1 4 8.5" />
      </svg>
    </a>
  )
}

LanguageToggle.afterDOMLoaded = languageToggleScript
LanguageToggle.css = styles

export default (() => LanguageToggle) satisfies QuartzComponentConstructor
