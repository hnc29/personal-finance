"use client";
import { useEffect, useState } from "react";
export type Language = "vi" | "en";
export const copy = { en: { transactions:"Transactions", accounts:"Accounts", categories:"Categories", review:"Review", portfolio:"Portfolio", title:"Personal Finance", eyebrow:"Local-first ledger", language:"Language" }, vi: { transactions:"Giao dịch", accounts:"Tài khoản", categories:"Danh mục", review:"Đối soát", portfolio:"Đầu tư", title:"Tài chính cá nhân", eyebrow:"Sổ cái lưu trữ cục bộ", language:"Ngôn ngữ" } } as const;
export function useLanguage(): [Language, (value: Language) => void] {
  const [language, setLanguage] = useState<Language>("vi");
  useEffect(() => {
    const saved = localStorage.getItem("pf-language");
    if (saved === "vi" || saved === "en") setLanguage(saved);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return [language, value => { setLanguage(value); localStorage.setItem("pf-language", value); }];
}
