import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arboProfile } from "../arbo/profile";
import { OUT_OF_SCOPE_MESSAGE } from "../arbo/prompt";
import { caoProfile } from "../cao/profile";
import { clarifiedOutcome, refused } from "@wunderstack/shared";
import { createGroundedAgent, verifyAndBuild } from "./create-agent";
import type { AgentRuntimeProfile, RetrievalOutput } from "./profile";

const EMPTY_RETRIEVAL: RetrievalOutput = {
  context: "",
  citations: [],
  hits: [],
  timings: { rewriteMs: 0, embedMs: 0, searchMs: 0, rerankMs: 0, totalMs: 0 },
  chunks: [],
  fullChunkContent: [],
  consideredCount: 0,
  aboveThresholdCount: 0,
  droppedChunks: [],
  progressFound: [],
  progressDropped: [],
  usedPassageCount: 0,
};

describe("turn outcome classification — pipeline paths", () => {
  it("routes salary clarification before retrieval as clarified/ambiguous_query", async () => {
    const agent = createGroundedAgent(caoProfile);
    const result = await agent.answer({
      question: "Hoeveel verdien ik per maand?",
      fund: "eval",
    });
    assert.equal(result.needsClarification, true);
    assert.deepEqual(result.turnOutcome, clarifiedOutcome());
    assert.notEqual(result.turnOutcome.outcome, "refused");
    assert.equal(result.retrievedCount, 0);
    assert.equal(result.topScore, null);
  });

  it("routes empty retrieval as refused/no_coverage", async () => {
    const profile: AgentRuntimeProfile = {
      ...caoProfile,
      runRetrieval: async () => EMPTY_RETRIEVAL,
    };
    const agent = createGroundedAgent(profile);
    const result = await agent.answer({
      question: "Wat is de jubileumgratificatie?",
      fund: "eval",
    });
    assert.deepEqual(result.turnOutcome, refused("no_coverage"));
    assert.equal(result.retrievedCount, 0);
    assert.equal(result.topScore, null);
  });

  it("fills retrieved_count / top_score from droppedChunks on empty hits (§7.1)", async () => {
    const profile: AgentRuntimeProfile = {
      ...caoProfile,
      runRetrieval: async () => ({
        ...EMPTY_RETRIEVAL,
        consideredCount: 2,
        droppedChunks: [
          {
            chunkId: "below-1",
            ordinal: 0,
            content: "te zwak",
            score: 0.41,
            source: {
              documentId: "doc",
              title: "CAO",
              sourceUri: "",
              fund: "eval",
              agentKey: "cao",
              schemaName: "fund_eval",
              version: "1",
            },
            structure: {
              chapter: null,
              article: null,
              lid: null,
              sourceRef: null,
              chunkType: "text",
            },
            metadata: {},
          },
          {
            chunkId: "below-2",
            ordinal: 1,
            content: "ook te zwak",
            score: 0.37,
            source: {
              documentId: "doc",
              title: "CAO",
              sourceUri: "",
              fund: "eval",
              agentKey: "cao",
              schemaName: "fund_eval",
              version: "1",
            },
            structure: {
              chapter: null,
              article: null,
              lid: null,
              sourceRef: null,
              chunkType: "text",
            },
            metadata: {},
          },
        ],
      }),
    };
    const agent = createGroundedAgent(profile);
    const result = await agent.answer({
      question: "Wat is de jubileumgratificatie?",
      fund: "eval",
    });
    assert.deepEqual(result.turnOutcome, refused("no_coverage"));
    assert.equal(result.answer, caoProfile.notFoundMessage);
    assert.equal(result.retrievedCount, 2);
    assert.equal(result.topScore, 0.41);
  });

  /**
   * Made red once (5 Sep 2026) before the fall-through. Serve-replace overwrote the
   * model sentence with `notFoundMessage` and classified `no_coverage`:
   *
   *   AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
   *   + actual - expected
   *   + 'Ik kan dit niet terugvinden in de arbocatalogus waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.'
   *   - 'Deze vraag valt buiten de arbocatalogus waar ik toegang toe heb. Voor regels uit de Arbowet of je CAO kun je de CAO-agent of je fonds raadplegen. Voor individueel veiligheidsadvies: neem contact op met de bedrijfsarts of je fonds.'
   *
   * The expected string in that run was the pre-B6 sentence; the mechanism (replace with
   * NOT_IN_CATALOG) is what this assertion closes.
   */
  it("keeps the arbo out-of-scope sentence as refused/out_of_scope (not no_coverage)", () => {
    const retrieval: RetrievalOutput = {
      ...EMPTY_RETRIEVAL,
      hits: [{ chunkId: "c1", ordinal: 0, score: 0.4, title: "Catalogus" }],
      fullChunkContent: [["c1", "Spanningsloos maken van het HV-systeem."]],
      consideredCount: 1,
      aboveThresholdCount: 1,
    };
    const result = verifyAndBuild(arboProfile, OUT_OF_SCOPE_MESSAGE, retrieval, "");
    assert.equal(result.answer, OUT_OF_SCOPE_MESSAGE);
    assert.deepEqual(result.turnOutcome, refused("out_of_scope"));
    assert.equal(result.found, false);
    assert.deepEqual(result.citations, []);
  });
});
