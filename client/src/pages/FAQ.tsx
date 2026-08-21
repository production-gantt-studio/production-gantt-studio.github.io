import { ChevronLeft, CircleHelp, FolderKanban, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { faqContent } from "@/lib/faqContent";

export default function FAQ() {
  const [, setLocation] = useLocation();
  return (
    <div className="studio-shell manager-shell faq-shell">
      <aside className="studio-sidebar no-print">
        <div className="brand-lockup">
          <span className="brand-mark" role="img" aria-label="Production Gantt Studio">PG</span>
          <div><p className="brand-name">PRODUCTION</p><p className="brand-name brand-name-accent">GANTT STUDIO</p></div>
        </div>
        <div className="side-section-label">ヘルプ</div>
        <nav className="side-nav" aria-label="ヘルプメニュー">
          <button className="side-nav-item" onClick={() => setLocation("/")}><FolderKanban size={17} />案件一覧</button>
          <button className="side-nav-item active"><CircleHelp size={17} />よくある質問</button>
        </nav>
        <div className="manager-sidebar-note"><ShieldCheck size={16} /><div><b>安心して使うために</b><span>分からない時は、ここを読んでください。</span></div></div>
      </aside>
      <main className="studio-main manager-main faq-main">
        <header className="topbar no-print"><div className="breadcrumb"><strong>よくある質問</strong></div><div className="topbar-actions"><button className="outline-button" onClick={() => setLocation("/")}><ChevronLeft size={16} />案件一覧へ戻る</button></div></header>
        <section className="faq-heading">
          <p>やさしいQ&A</p>
          <h1>困ったら、ここを見てください。</h1>
          <span>案件を作る人、保存される場所、削除した時のことを、短く説明します。</span>
        </section>
        <section className="faq-list" aria-label="よくある質問">
          {faqContent.map((item, index) => <article className="faq-item" key={item.question}>
            <div className="faq-number">{String(index + 1).padStart(2, "0")}</div>
            <div><h2>Q. {item.question}</h2><p>A. {item.answer}</p></div>
          </article>)}
        </section>
        <section className="faq-summary">
          <ShieldCheck size={20} />
          <div><b>いちばん大事なこと</b><span>ログインして作った案件は、勝手に消える仕様ではありません。削除した案件も、30日間はアーカイブから戻せます。</span></div>
        </section>
      </main>
    </div>
  );
}
