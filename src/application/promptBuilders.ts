import type { AnalysisRecord } from '../domain/workflowSession';
import type { ChangeSet } from './ports';
import { buildReviewMarker, CODE_REVIEW_HEADING, FINAL_PLAN_HEADING } from './reviewProtocol';

function describeChangeSet(changeSet: ChangeSet): string {
  const sections: string[] = [];
  sections.push(changeSet.diff.trim() !== '' ? `\`\`\`diff\n${changeSet.diff.trim()}\n\`\`\`` : '_Nessuna modifica rilevata ai file tracciati._');
  if (changeSet.isTruncated) {
    sections.push('_Il diff è stato troncato: leggi direttamente i file modificati per le parti mancanti._');
  }
  if (changeSet.untrackedFiles.length > 0) {
    sections.push(
      `File nuovi non ancora tracciati (leggili direttamente):\n${changeSet.untrackedFiles.map((file) => `- ${file}`).join('\n')}`,
    );
  }
  return sections.join('\n\n');
}

export function buildReviewPrompt(reviewId: string, analysis: AnalysisRecord, changeSet: ChangeSet): string {
  return [
    buildReviewMarker(reviewId),
    'Esegui una review dell\'implementazione corrente in due parti. Non modificare alcun file.',
    '',
    '## Requisiti',
    analysis.requirements,
    '',
    '## Piano di implementazione iniziale',
    analysis.plan,
    '',
    '## Stato attuale dell\'implementazione (git diff rispetto a HEAD)',
    describeChangeSet(changeSet),
    '',
    '## Istruzioni',
    `Rispondi usando ESATTAMENTE le due intestazioni seguenti, nell'ordine indicato.`,
    '',
    `### ${FINAL_PLAN_HEADING}`,
    'Confronta il piano iniziale con lo stato attuale. Riporta il piano finale così come è stato realizzato e metti in evidenza, in un elenco puntato, ogni divergenza (step non implementati, step aggiunti, scelte diverse) e ogni requisito non coperto.',
    '',
    `### ${CODE_REVIEW_HEADING}`,
    'Sulla base dello stato finale, esegui una code review: elenca problemi ed errori rilevati (bug, casi limite, sicurezza, test mancanti, regressioni), ordinati per gravità, con file e riga quando possibile. Se non trovi problemi, dichiaralo esplicitamente.',
  ].join('\n');
}

export function buildStyleCheckPrompt(): string {
  return [
    'Verifica che il codice nuovo o modificato (vedi le modifiche correnti del repository rispetto a HEAD) sia allineato stilisticamente al codice preesistente.',
    '',
    'Controlla in particolare:',
    '- nomenclatura di classi, metodi, funzioni, variabili e file;',
    '- stile di scrittura del codice (formattazione, struttura, idiomi e pattern ricorrenti);',
    '- organizzazione dei moduli e convenzioni su commenti, tipi e gestione degli errori;',
    '- utilizzo di utility e servizi già esistenti al posto di duplicazioni.',
    '',
    'Non modificare alcun file: riporta le incongruenze trovate, con file e riga, indicando per ciascuna come allinearla al codice esistente. Se il codice è già coerente, dichiaralo esplicitamente.',
  ].join('\n');
}
