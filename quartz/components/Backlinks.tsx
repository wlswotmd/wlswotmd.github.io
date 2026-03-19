import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import style from "./styles/backlinks.scss"
import { resolveCanonical, resolveRelative, simplifySlug } from "../util/path"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"
import OverflowListFactory from "./OverflowList"

interface BacklinksOptions {
  hideWhenEmpty: boolean
}

const defaultOptions: BacklinksOptions = {
  hideWhenEmpty: true,
}

export default ((opts?: Partial<BacklinksOptions>) => {
  const options: BacklinksOptions = { ...defaultOptions, ...opts }
  const { OverflowList, overflowListAfterDOMLoaded } = OverflowListFactory()

  const Backlinks: QuartzComponent = ({
    fileData,
    allFiles,
    displayClass,
  }: QuartzComponentProps) => {
    const backlinksTitleEn = i18n("en-US").components.backlinks.title
    const backlinksTitleKo = i18n("ko-KR").components.backlinks.title
    const noBacklinksEn = i18n("en-US").components.backlinks.noBacklinksFound
    const noBacklinksKo = i18n("ko-KR").components.backlinks.noBacklinksFound
    const slug = simplifySlug(fileData.slug!)
    const backlinkFiles = allFiles.filter((file) => file.links?.includes(slug))
    if (options.hideWhenEmpty && backlinkFiles.length == 0) {
      return null
    }
    return (
      <div class={classNames(displayClass, "backlinks")}>
        <h3>
          <span class="lang-text" data-lang="en">
            {backlinksTitleEn}
          </span>
          <span class="lang-text" data-lang="ko">
            {backlinksTitleKo}
          </span>
        </h3>
        <OverflowList>
          {backlinkFiles.length > 0 ? (
            backlinkFiles.map((f) => (
              <li>
                <a
                  href={resolveRelative(fileData.slug!, f.slug!)}
                  class="internal"
                  data-canonical-href={resolveCanonical(f.slug!)}
                >
                  {f.frontmatter?.title_ko ? (
                    <>
                      <span class="lang-title" data-lang="en">
                        {f.frontmatter?.title}
                      </span>
                      <span class="lang-title" data-lang="ko">
                        {f.frontmatter?.title_ko}
                      </span>
                    </>
                  ) : (
                    f.frontmatter?.title
                  )}
                </a>
              </li>
            ))
          ) : (
            <li>
              <span class="lang-text" data-lang="en">
                {noBacklinksEn}
              </span>
              <span class="lang-text" data-lang="ko">
                {noBacklinksKo}
              </span>
            </li>
          )}
        </OverflowList>
      </div>
    )
  }

  Backlinks.css = style
  Backlinks.afterDOMLoaded = overflowListAfterDOMLoaded

  return Backlinks
}) satisfies QuartzComponentConstructor
