import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { getSiteData } from '@/lib/data';
import { homeUrl, sectionUrl } from '@/lib/format';
import type { Section } from '@/lib/types';

const linkClass = 'text-fg-2 underline-offset-[3px] hover:text-fg hover:underline';

const Column = ({ title, children }: { title: string; children: ReactNode }) => (
  <div>
    <h2 className="mb-3 text-[13px] font-bold">{title}</h2>
    <ul className="space-y-2">{children}</ul>
  </div>
);

const SectionLinks = ({ sections }: { sections: Section[] }) =>
  sections.map((s) => <li key={s.slug}><Link href={sectionUrl(s.slug)} className={linkClass}>{s.name}</Link></li>);

export default async function SiteFooter() {
  const { site } = await getSiteData();
  const half = Math.ceil(site.sections.length / 2);

  return (
    <div id="site-footer" className="print:hidden">
      <footer className="border-t-[3px] border-double border-rule bg-surface pt-12 pb-7 text-[14px]">
        <div className="page-container">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 max-lg:grid-cols-3 max-md:grid-cols-2">
            <div className="max-lg:col-span-full">
              <Link href={homeUrl} className="font-display text-[26px] font-extrabold">{site.name}</Link>
              <p className="mt-2.5 max-w-[360px] text-fg-2">{site.footer.about}</p>
            </div>
            <Column title="Sections"><SectionLinks sections={site.sections.slice(0, half)} /></Column>
            <Column title="More"><SectionLinks sections={site.sections.slice(half)} /></Column>
            <Column title="Company">
              {site.footer.company.map((label) => <li key={label}><a href="#" className={linkClass}>{label}</a></li>)}
            </Column>
          </div>
          <div className="mt-10 flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-line pt-[18px] text-[13px] text-muted">
            <span>© {new Date().getFullYear()} {site.name}. All rights reserved.</span>
            <span>
              {site.footer.help.map((label, index) => (
                <Fragment key={label}>
                  {index > 0 && <> &nbsp;·&nbsp; </>}
                  <a href="#">{label}</a>
                </Fragment>
              ))}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
