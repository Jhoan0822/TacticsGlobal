import { GoogleGenAI } from "@google/genai";
import { GameState, Faction, UnitClass } from "../types";

// Note: In a real deployment, ensure process.env.API_KEY is available.
// The prompt prohibits asking the user for the key, assuming it's in env.
// For this prototype, we'll initialize defensively.

let ai: GoogleGenAI | null = null;
try {
  if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
} catch (e) {
  console.error("Failed to init Gemini", e);
}

export const getTacticalAdvice = async (gameState: GameState): Promise<string> => {
  if (!ai) return "AI System Offline: Missing API Key Configuration.";

  const playerUnits = gameState.units.filter(u => u.factionId === 'PLAYER');
  const enemyUnits = gameState.units.filter(u => u.factionId !== 'PLAYER' && u.factionId !== 'NEUTRAL');

  // Summarize state for the prompt
  const summary = {
    playerCount: playerUnits.length,
    enemyCount: enemyUnits.length,
    playerComposition: countClasses(playerUnits),
    enemyComposition: countClasses(enemyUnits),
    resources: gameState.playerResources
  };

  const prompt = `
    You are a high-command military AI advisor in a Real-Time Strategy game based on live aircraft/ship data.
    Current Situation:
    ${JSON.stringify(summary, null, 2)}
    
    The player controls blue units. Enemies are red.
    Unit Types:
    - HEAVY_BOMBER (Slow, High Damage)
    - FIGHTER_JET (Fast, Anti-Air)
    - AIRCRAFT_CARRIER (Spawns units, High HP)
    - DESTROYER (Anti-Ship)
    
    Give me a 2-sentence tactical analysis and 1 recommendation. Be concise and use military terminology.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Communication interference. Stand by.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "AI Uplink Failed. Proceed with caution.";
  }
};

const countClasses = (units: any[]) => {
  const counts: Record<string, number> = {};
  units.forEach(u => {
    counts[u.unitClass] = (counts[u.unitClass] || 0) + 1;
  });
  return counts;
};