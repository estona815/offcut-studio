import type { Workspace } from '../domain/types';
import { editScrap, markPieceCut, nextInstruction, replan, withMessage } from './workspace';

export const COMMAND_HELP = 'Supported commands: “mark front cut”, “mark back cut”, “mark pocket cut”, “mark coaster-a cut”, “mark coaster-b cut”, “the ochre scrap is only six centimeters tall”, “make back 10 cm wide”, “replan pocket”, and “what’s next”. Measurements accept digits or zero–twenty, cm/mm or centimeter/millimeter words, and optional “the”/“only”. This is a limited command interpreter, not a live Alexa or language-model connection.';

const WORD_NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const NUMBER_PATTERN = `(?:\\d+(?:\\.\\d+)?|${WORD_NUMBERS.join('|')})`;
const UNIT_PATTERN = '(?:cm|mm|centimet(?:er|re)s?|millimet(?:er|re)s?)';
const MEASUREMENT = new RegExp(`^(?:the )?([a-z][a-z0-9 -]{0,79}?) scrap is (?:only )?(${NUMBER_PATTERN}) (${UNIT_PATTERN}) (tall|high|wide)$`);
const RESIZE = new RegExp(`^make (?:the )?(front|back|pocket) (?:only )?(${NUMBER_PATTERN}) (${UNIT_PATTERN}) (wide|tall|high)$`);

function millimetres(value: string, unit: string): number {
  const wordValue = WORD_NUMBERS.indexOf(value);
  return (wordValue < 0 ? Number(value) : wordValue) * (unit === 'cm' || unit.startsWith('centimet') ? 10 : 1);
}

function cutExamples(state: Workspace): string {
  return state.plan.pieces.map(piece => `“mark ${piece.id} cut”`).join(', ');
}

/** The supported grammar is intentionally explicit. Never infer physical completion. */
export function executeCommand(state: Workspace, input: string): Workspace {
  if (typeof input !== 'string' || input.length > 300) return withMessage(state, 'Use a short command. Say “help” for the supported grammar.');
  const text = input.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  if (!text || text === 'help') return withMessage(state, `For this project: ${cutExamples(state)}. ${COMMAND_HELP}`);
  if (text === "what's next" || text === 'what is next' || text === 'next') return withMessage(state, nextInstruction(state));
  const cut = text.match(/^(?:mark )?(?:the )?(front|back|pocket|coaster[- ]?[ab]|coaster face|coaster reverse)(?: as)? cut$/);
  if (cut) {
    const pieceId = cut[1].startsWith('coaster')
      ? /(?:a|face)$/.test(cut[1]) ? 'coaster-a' : 'coaster-b' : cut[1];
    return markPieceCut(state, pieceId);
  }
  if (text === 'cut it' || text === 'mark it cut' || text === 'done' || text === 'cut') {
    return withMessage(state, `Which piece did you finish cutting? Say ${cutExamples(state)}. No cut has been recorded.`);
  }
  if (/^(?:replan|recover)(?: pocket)?$/.test(text)) return replan(state);
  const measure = text.match(MEASUREMENT);
  if (measure) {
    const stock = state.scraps.find(item => item.id.toLowerCase() === measure[1]
      || item.name.toLowerCase() === measure[1] || item.name.toLowerCase() === `${measure[1]} scrap`);
    if (!stock) return withMessage(state, 'Name an existing scrap to update its measurement.');
    const points = stock.geometry.flat(2);
    if (!points.length) return withMessage(state, 'That scrap has no uncut material left. Add a new scrap instead of restoring consumed fabric.');
    const width = Math.max(...points.map(point => point[0]));
    const height = Math.max(...points.map(point => point[1]));
    const value = millimetres(measure[2], measure[3]);
    return editScrap(state, stock.id, measure[4] === 'wide' ? value : width, measure[4] === 'wide' ? height : value, 'rectangle');
  }
  const resize = text.match(RESIZE);
  if (resize) {
    const value = millimetres(resize[2], resize[3]);
    return replan(state, { [resize[1]]: resize[4] === 'wide' ? { cutWidth: value } : { cutHeight: value } });
  }
  return withMessage(state, 'I could not match that to a supported command. Include the piece or scrap, number and cm/mm unit. Nothing changed. Say “help” for examples.');
}
