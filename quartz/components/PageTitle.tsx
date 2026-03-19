import { FullSlug, pathToRoot, resolveCanonical } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

const PageTitle: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const title = cfg?.pageTitle ?? i18n(cfg.locale).propertyDefaults.title
  const baseDir = pathToRoot(fileData.slug!)
  return (
    <h2 class={classNames(displayClass, "page-title")}>
      <a
        class="internal"
        href={baseDir}
        data-canonical-href={resolveCanonical("index" as FullSlug)}
      >
        {title}
      </a>
    </h2>
  )
}

PageTitle.css = `
.page-title {
  font-size: 1.75rem;
  margin: 0;
  font-family: var(--titleFont);
  min-width: 0;
}

.page-title > a.internal {
  display: block;
  background-color: transparent;
  padding: 0;
  border-radius: 0;
  line-height: inherit;
}

@media all and (max-width: 800px) {
  .page-title {
    flex: 1 1 auto;
    font-size: 1.45rem;
    overflow: hidden;
  }

  .page-title > a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
`

export default (() => PageTitle) satisfies QuartzComponentConstructor
