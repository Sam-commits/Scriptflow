import { describe, expect, it } from 'vitest';
import { parseFdx, toFdx } from '../io/fdx';
import { Script, blockText } from '../model';
import { sampleScreenplay } from '../sample';

describe('fdx', () => {
  it('round-trips a screenplay with styles', () => {
    const s: Script = { ...sampleScreenplay, blocks: [
      ...sampleScreenplay.blocks,
      { type: 'action', runs: [{ text: 'A ' }, { text: 'bold & <odd>', bold: true, underline: true }] },
    ] };
    const again = parseFdx(toFdx(s));
    expect(again.docType).toBe('screenplay');
    expect(again.titlePage.title).toBe('THE LIGHTHOUSE KEEPER');
    expect(again.titlePage.author).toBe('Your Name');
    expect(again.blocks).toEqual(s.blocks);
  });

  it('detects stageplays', () => {
    const s: Script = { docType: 'stageplay', titlePage: sampleScreenplay.titlePage, blocks: [
      { type: 'act', runs: [{ text: 'Act One' }] },
      { type: 'scene', runs: [{ text: 'Scene 1' }] },
      { type: 'stage_direction', runs: [{ text: 'Lights up.' }] },
      { type: 'character', runs: [{ text: 'NORA' }] },
      { type: 'dialogue', runs: [{ text: 'Hello.' }] },
    ] };
    const again = parseFdx(toFdx(s));
    expect(again.docType).toBe('stageplay');
    expect(again.blocks.map((b) => b.type)).toEqual(s.blocks.map((b) => b.type));
  });

  it('reads a Final Draft file with unknown paragraph types', () => {
    const xml = `<?xml version="1.0"?><FinalDraft DocumentType="Script" Version="5"><Content>
      <Paragraph Type="Scene Heading"><SceneProperties Length="1"/><Text>INT. CAR - DAY</Text></Paragraph>
      <Paragraph Type="Lyrics"><Text>la la</Text></Paragraph></Content></FinalDraft>`;
    const s = parseFdx(xml);
    expect(s.blocks.map((b) => [b.type, blockText(b)])).toEqual([['scene_heading', 'INT. CAR - DAY'], ['action', 'la la']]);
  });
});
