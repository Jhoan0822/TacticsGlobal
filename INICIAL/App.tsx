
import React, { useEffect, useState, useRef } from 'react';
import GameMap from './components/GameMap';
import Sidebar from './components/Sidebar';
import EventLog from './components/EventLog';
import { GameState, UnitClass, GameUnit, Faction, POIType } from './types';
import { fetchWorldData } from './services/mockDataService';
import { processGameTick, spawnUnit, evaluateAllianceRequest } from './services/gameLogic';
import { GAME_TICK_MS, UNIT_CONFIG, DIPLOMACY } from './constants';
import { AudioService } from './services/audioService';
import { TerrainService } from './services/terrainService';
import L from 'leaflet';

const App: React.FC = () => {
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });
  const [gameState, setGameState] = useState<GameState>({
    factions: [],
    units: [],
    pois: [],
    projectiles: [],
    explosions: [],
    playerResources: { gold: 5000, oil: 2000, intel: 0 }, 
    controlGroups: {},
    territoryControlled: 0,
    gameTick: 0,
    gameMode: 'SELECT_BASE',
    messages: [],
  });
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const lastRightClick = useRef<number>(0);

  // START GAME (SINGLE PLAYER)
  const startGame = async () => {
      // Init World
      const data = await fetchWorldData(0, 0, 10000);
      
      let newGameState = {
          ...gameState,
          factions: data.factions,
          units: data.units,
          pois: data.pois,
          messages: [{ id: 'init', text: 'Global Command Link Established.', type: 'info', timestamp: Date.now() } as any]
      };

      setGameState(newGameState);
      AudioService.playSuccess();
  };

  useEffect(() => {
    startGame();
  }, []);

  useEffect(() => {
    if (gameState.gameMode !== 'PLAYING' && gameState.gameMode !== 'PLACING_STRUCTURE') return;
    
    const interval = setInterval(() => {
      setGameState(prevState => processGameTick(prevState));
    }, GAME_TICK_MS);
    return () => clearInterval(interval);
  }, [gameState.gameMode]);

  // Audio Triggers
  useEffect(() => {
      if (gameState.projectiles.length > 0 && gameState.gameTick % 10 === 0) {
          AudioService.playGunfire();
      }
  }, [gameState.projectiles.length]);

  // KEYBOARD LISTENERS
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (gameState.gameMode !== 'PLAYING') return;

          if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
              const groupNum = parseInt(e.key);
              if (e.ctrlKey) {
                  // ASSIGN GROUP
                  if (selectedUnitIds.length > 0) {
                      setGameState(prev => ({
                          ...prev,
                          controlGroups: { ...prev.controlGroups, [groupNum]: [...selectedUnitIds] }
                      }));
                      AudioService.playSuccess();
                  }
              } else {
                  // RECALL GROUP
                  const group = gameState.controlGroups[groupNum];
                  if (group && group.length > 0) {
                      setSelectedUnitIds(group);
                      AudioService.playUiClick();
                  }
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.gameMode, gameState.controlGroups, selectedUnitIds]);


  const handleUnitClick = (id: string, multiSelect: boolean) => { 
      if (gameState.gameMode === 'PLAYING') {
          if (multiSelect) {
             setSelectedUnitIds(prev => prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]);
          } else {
             setSelectedUnitIds([id]);
          }
          AudioService.playUiClick();
      }
  };

  const handleUnitRightClick = (id: string) => {
      if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
          const targetUnit = gameState.units.find(u => u.id === id);
          if (targetUnit && targetUnit.factionId !== 'PLAYER') {
              setGameState(prev => ({ 
                  ...prev, 
                  units: prev.units.map(u => { 
                      if (selectedUnitIds.includes(u.id) && u.factionId === 'PLAYER') { 
                          return { ...u, targetId: id, destination: null }; 
                      } 
                      return u; 
                  }) 
              }));
              AudioService.playSuccess();
          }
      }
  };

  const handlePoiRightClick = (id: string) => {
      if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
          const targetPoi = gameState.pois.find(p => p.id === id);
          if (targetPoi && targetPoi.ownerFactionId !== 'PLAYER') {
               setGameState(prev => ({ 
                   ...prev, 
                   units: prev.units.map(u => { 
                       if (selectedUnitIds.includes(u.id) && u.factionId === 'PLAYER') { 
                           return { ...u, targetId: id, destination: null }; 
                       } 
                       return u; 
                   }) 
               }));
               AudioService.playSuccess();
          }
      }
  };

  const handleUnitAction = (action: string, unitId: string) => {
      const unit = gameState.units.find(u => u.id === unitId);
      if (!unit || unit.factionId !== 'PLAYER') return;

      let typeToSpawn: UnitClass | null = null;
      if (action === 'DEPLOY_TANK') typeToSpawn = UnitClass.GROUND_TANK;
      else if (action === 'DEPLOY_SPECOPS') typeToSpawn = UnitClass.SPECIAL_FORCES;
      else if (action === 'DEPLOY_INFANTRY') typeToSpawn = UnitClass.INFANTRY;

      if (typeToSpawn) {
          const cost = UNIT_CONFIG[typeToSpawn].cost;
          if (!cost) return;

          if (gameState.playerResources.gold >= cost.gold && gameState.playerResources.oil >= cost.oil) {
              const offsetLat = (Math.random() - 0.5) * 0.005;
              const offsetLng = (Math.random() - 0.5) * 0.005;
              const newUnit = spawnUnit(typeToSpawn, unit.position.lat + offsetLat, unit.position.lng + offsetLng);
              setGameState(prev => ({
                  ...prev,
                  playerResources: { ...prev.playerResources, gold: prev.playerResources.gold - cost.gold, oil: prev.playerResources.oil - cost.oil },
                  units: [...prev.units, newUnit]
              }));
              AudioService.playSuccess();
          } else {
              AudioService.playAlert();
          }
      }
  };

  const handleMapRightClick = (lat: number, lng: number) => {
    if (gameState.gameMode === 'PLAYING' && selectedUnitIds.length > 0) {
        
        const now = Date.now();
        const timeDiff = now - lastRightClick.current;
        lastRightClick.current = now;
        const isDouble = timeDiff < 250; 

        setGameState(prev => ({ 
            ...prev, 
            units: prev.units.map(u => { 
                if (selectedUnitIds.includes(u.id) && u.factionId === 'PLAYER') { 
                    if (!TerrainService.isValidMove(u.unitClass, lat, lng, gameState.pois)) {
                        return u;
                    }
                    return { 
                        ...u, 
                        destination: { lat, lng }, 
                        targetId: null,
                        isBoosting: isDouble 
                    }; 
                } 
                return u; 
            }) 
        }));
        AudioService.playUiClick();
        
    } else if (gameState.gameMode === 'PLACING_STRUCTURE') {
        setGameState(prev => ({ ...prev, gameMode: 'PLAYING', placementType: null }));
    }
  };

  // Callback from GameMap -> DragSelection
  const handleMultiSelect = (ids: string[]) => {
      setSelectedUnitIds(ids);
      if (ids.length > 0) AudioService.playUiClick();
  };

  const handlePoiClick = (poiId: string) => {
      if (gameState.gameMode === 'SELECT_BASE') {
          const poi = gameState.pois.find(p => p.id === poiId);
          if (poi && poi.type === POIType.CITY) {
               const hq: GameUnit = {
                  id: 'PLAYER-HQ',
                  unitClass: UnitClass.COMMAND_CENTER,
                  factionId: 'PLAYER',
                  position: { lat: poi.position.lat, lng: poi.position.lng },
                  heading: 0,
                  ...UNIT_CONFIG[UnitClass.COMMAND_CENTER],
                  realWorldIdentity: undefined,
                  isBoosting: false
              };
              const updatedPois = gameState.pois.map(p => {
                  if (p.id === poiId) return { ...p, ownerFactionId: 'PLAYER', tier: 1 };
                  return p;
              });

              setCenter({ lat: poi.position.lat, lng: poi.position.lng });
              setGameState(prev => ({ 
                  ...prev, 
                  units: [hq, ...prev.units], 
                  pois: updatedPois, 
                  gameMode: 'PLAYING' 
              }));
              setSelectedUnitIds([hq.id]);
              AudioService.playSuccess();
          }
      }
  };

  const handleMapClick = (lat: number, lng: number) => {
     if (gameState.gameMode === 'PLACING_STRUCTURE') {
        if (!gameState.placementType) return;
        
        const type = gameState.placementType;
        const cost = UNIT_CONFIG[type].cost;
        if (!cost) return;

        if (!TerrainService.isValidPlacement(type, lat, lng, gameState.pois)) {
            alert("Invalid Terrain! Ports must be near coast, Airbases on land.");
            AudioService.playAlert();
            return;
        }

        const newUnit = spawnUnit(type, lat, lng);
        setGameState(prev => ({
            ...prev,
            playerResources: { ...prev.playerResources, gold: prev.playerResources.gold - cost.gold, oil: prev.playerResources.oil - cost.oil },
            units: [...prev.units, newUnit],
            gameMode: 'PLAYING',
            placementType: null
        }));
        AudioService.playSuccess();
    } else if (gameState.gameMode === 'PLAYING') {
        setSelectedUnitIds([]);
    }
  };

  const handleBuyUnit = (type: UnitClass) => {
      const cost = UNIT_CONFIG[type].cost;
      if (!cost) return;
      if (gameState.playerResources.gold < cost.gold || gameState.playerResources.oil < cost.oil) {
          AudioService.playAlert();
          return;
      }

      if (type === UnitClass.AIRBASE || type === UnitClass.PORT || type === UnitClass.MILITARY_BASE) {
          setGameState(prev => ({ ...prev, gameMode: 'PLACING_STRUCTURE', placementType: type }));
          AudioService.playUiClick();
          return;
      }

      let spawnLat: number | null = null;
      let spawnLng: number | null = null;

      const seaUnits = [UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.SUBMARINE, UnitClass.AIRCRAFT_CARRIER, UnitClass.BATTLESHIP, UnitClass.PATROL_BOAT, UnitClass.MINELAYER];
      const isSea = seaUnits.includes(type);

      if (isSea) {
          const validCities = gameState.pois.filter(p => p.ownerFactionId === 'PLAYER' && p.type === POIType.CITY && p.isCoastal);
          const validPorts = gameState.units.filter(u => u.factionId === 'PLAYER' && u.unitClass === UnitClass.PORT);
          const allSites = [...validCities, ...validPorts];

          if (allSites.length > 0) {
              const site = allSites[Math.floor(Math.random() * allSites.length)];
              spawnLat = site.position.lat; spawnLng = site.position.lng;
          }
      } else {
          const validSites = [
              ...gameState.pois.filter(p => p.ownerFactionId === 'PLAYER' && p.type === POIType.CITY),
              ...gameState.units.filter(u => u.factionId === 'PLAYER' && (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MILITARY_BASE || u.unitClass === UnitClass.AIRBASE))
          ];
           if (validSites.length > 0) {
              const site = validSites[Math.floor(Math.random() * validSites.length)];
              // @ts-ignore
              spawnLat = site.position.lat; spawnLng = site.position.lng;
          }
      }

      if (spawnLat !== null && spawnLng !== null) {
          setGameState(prev => ({
              ...prev,
              playerResources: { ...prev.playerResources, gold: prev.playerResources.gold - cost.gold, oil: prev.playerResources.oil - cost.oil },
              units: [...prev.units, spawnUnit(type, spawnLat! + (Math.random() - 0.5) * 0.05, spawnLng! + (Math.random() - 0.5) * 0.05)]
          }));
          AudioService.playSuccess();
      } else {
          alert(isSea ? "Commander, we need a Coastal City or Port!" : "Commander, we need a secure base or city for production!");
          AudioService.playAlert();
      }
  };

  const handleAllianceRequest = (factionId: string) => {
      const result = evaluateAllianceRequest(gameState, factionId);
      
      setGameState(prev => {
          let newFactions = [...prev.factions];
          let newMessages = [...prev.messages];
          if (result.accepted) {
               newFactions = newFactions.map(f => {
                   if (f.id === 'PLAYER') return { ...f, relations: { ...f.relations, [factionId]: 100 } };
                   if (f.id === factionId) return { ...f, relations: { ...f.relations, ['PLAYER']: 100 } };
                   return f;
               });
               newMessages.push({ id: Math.random().toString(), text: `Alliance ACCEPTED by ${newFactions.find(f=>f.id===factionId)?.name}`, type: 'success', timestamp: Date.now() });
               AudioService.playSuccess();
          } else {
               newMessages.push({ id: Math.random().toString(), text: `Alliance REJECTED: ${result.reason}`, type: 'alert', timestamp: Date.now() });
               AudioService.playAlert();
          }
          return { ...prev, factions: newFactions, messages: newMessages };
      });
  };

  return (
    <div className="w-full h-screen relative bg-slate-900 overflow-hidden flex">
      <Sidebar 
          gameState={gameState} 
          onBuyUnit={handleBuyUnit} 
          onAllianceRequest={handleAllianceRequest} 
          selectedUnitIds={selectedUnitIds}
          onUnitAction={handleUnitAction}
      />
      <div className="flex-1 relative">
        <GameMap 
          units={gameState.units} factions={gameState.factions} pois={gameState.pois} projectiles={gameState.projectiles} explosions={gameState.explosions}
          center={center} selectedUnitIds={selectedUnitIds}
          onUnitClick={handleUnitClick} onUnitRightClick={handleUnitRightClick} onUnitAction={handleUnitAction}
          onMapClick={handleMapClick} onMapRightClick={handleMapRightClick} onPoiClick={handlePoiClick} onPoiRightClick={handlePoiRightClick}
          onMultiSelect={handleMultiSelect}
          gameMode={gameState.gameMode}
        />
        <EventLog messages={gameState.messages} />
        <div className="absolute inset-0 pointer-events-none z-[400] hex-overlay"></div>
      </div>
    </div>
  );
};

export default App;
