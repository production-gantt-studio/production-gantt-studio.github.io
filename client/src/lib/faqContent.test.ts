import { describe, expect, it } from "vitest";
import { faqContent } from "./faqContent";

describe("FAQ content", () => {
  it("explains that only logged-in administrators can create projects", () => {
    expect(faqContent.find((item) => item.question.includes("だれが案件を作れますか"))?.answer).toContain("ログインした管理者だけ");
  });

  it("states the 30-day archive and that expired shared links do not delete a project", () => {
    expect(faqContent.find((item) => item.question.includes("削除"))?.answer).toContain("30日以内");
    expect(faqContent.find((item) => item.question.includes("共有リンク"))?.answer).toContain("消えていません");
  });
});
