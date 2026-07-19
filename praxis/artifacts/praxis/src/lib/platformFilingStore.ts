import { useEffect, useReducer } from 'react';

/**
 * Platform Filing store (super-admin). The organised cabinet for contracts and MOUs across every
 * partner: master service agreements, partnership MOUs, DPAs, SLAs, NDAs and funder agreements.
 * Reactive + client-side (upload records metadata; real storage is a backend step), mirroring the
 * rest of the seeded Partner Hub prototype.
 */

export type FilingType = 'Partnership' | 'MSA' | 'MOU' | 'DPA' | 'SLA' | 'NDA' | 'Funder Agreement';
export type FilingStatus = 'active' | 'expiring' | 'draft' | 'expired';

export type Filing = {
  id: string;
  title: string;
  docType: FilingType;
  partner: string;        // partner display name, or 'Platform' for platform-wide
  counterparty: string;   // the other signatory
  status: FilingStatus;
  signed: string;         // ISO date or '' for drafts
  expires: string;        // ISO date or ''
  size: string;
};

export const FILING_TYPES: FilingType[] = ['Partnership', 'MSA', 'MOU', 'DPA', 'SLA', 'NDA', 'Funder Agreement'];

const SEED: Filing[] = [
  { id: 'fl_1', title: 'Synops - TalentForge Partnership Agreement', docType: 'Partnership', partner: 'TalentForge SA', counterparty: 'TalentForge SA (Pty) Ltd', status: 'active', signed: '2026-01-15', expires: '2028-01-14', size: '1.4 MB' },
  { id: 'fl_2', title: 'Synops - SkillBridge Reseller Agreement', docType: 'Partnership', partner: 'SkillBridge Africa', counterparty: 'SkillBridge Africa NPC', status: 'active', signed: '2026-02-02', expires: '2027-02-01', size: '980 KB' },
  { id: 'fl_3', title: 'MTN Master Services Agreement', docType: 'MSA', partner: 'TalentForge SA', counterparty: 'MTN Group', status: 'active', signed: '2026-03-12', expires: '2027-03-11', size: '640 KB' },
  { id: 'fl_4', title: 'Vodacom Service Level Agreement (renewal)', docType: 'SLA', partner: 'TalentForge SA', counterparty: 'Vodacom (Pty) Ltd', status: 'expiring', signed: '2025-08-01', expires: '2026-08-31', size: '210 KB' },
  { id: 'fl_5', title: 'MTN Foundation CSI MOU', docType: 'MOU', partner: 'TalentForge SA', counterparty: 'MTN SA Foundation', status: 'active', signed: '2026-06-01', expires: '2026-12-31', size: '320 KB' },
  { id: 'fl_6', title: 'MICT SETA Grant Agreement 2026-27', docType: 'Funder Agreement', partner: 'TalentForge SA', counterparty: 'MICT SETA', status: 'active', signed: '2026-04-01', expires: '2027-03-31', size: '1.2 MB' },
  { id: 'fl_7', title: 'Shoprite Master Services Agreement', docType: 'MSA', partner: 'SkillBridge Africa', counterparty: 'Shoprite Checkers (Pty) Ltd', status: 'active', signed: '2026-02-20', expires: '2027-02-19', size: '712 KB' },
  { id: 'fl_8', title: 'W&RSETA Grant Agreement', docType: 'Funder Agreement', partner: 'SkillBridge Africa', counterparty: 'W&RSETA', status: 'active', signed: '2026-05-05', expires: '2027-04-30', size: '1.1 MB' },
  { id: 'fl_9', title: 'Services SETA Discretionary Grant MOU', docType: 'MOU', partner: 'SkillBridge Africa', counterparty: 'Services SETA', status: 'draft', signed: '', expires: '', size: '48 KB' },
  { id: 'fl_10', title: 'Data Processing Addendum (POPIA)', docType: 'DPA', partner: 'Platform', counterparty: 'All partners', status: 'active', signed: '2026-01-15', expires: '', size: '260 KB' },
];

let filings: Filing[] = [...SEED];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function platformFilings(): Filing[] { return filings; }

export function addFiling(input: Omit<Filing, 'id'>): Filing {
  const rec: Filing = { ...input, id: `fl_${Date.now()}` };
  filings = [rec, ...filings];
  emit();
  return rec;
}
export function removeFiling(id: string) { filings = filings.filter((f) => f.id !== id); emit(); }
export function setFilingStatus(id: string, status: FilingStatus) {
  filings = filings.map((f) => (f.id === id ? { ...f, status } : f));
  emit();
}

export function useFilings() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  return { filings };
}
