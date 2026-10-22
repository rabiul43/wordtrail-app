  /* ---------- scene detection ----------
     Reads the paragraph being read, and the few before it (older ones count less), for four things: the PLACE
     (forest, tavern, at sea...), the WEATHER, the TIME (night or day) and the MOOD (tense, peaceful...). Together they
     pick a sound bed that fades in and out on its own as the story moves. The reader's own mix is never changed:
     between scenes it simply plays again. A word is a hint, a paragraph is the evidence. */
  const SC_PLACES = {   // d = by day or indoors, nt = at night (replaces d); out = open air (weather comes through in full)
    forest:   { n: 'Forest', out: 1, d: { birds: 34, wind: 20, river: 8 }, nt: { night: 46, wind: 18, creaks: 6 } },
    sea:      { n: 'At sea', out: 1, d: { waves: 56, wind: 34, creaks: 12 }, nt: { waves: 52, wind: 30, creaks: 14 } },
    tavern:   { n: 'Tavern', d: { cafe: 55, fire: 20, creaks: 8 } },
    hearth:   { n: 'By the fire', d: { fire: 52, clock: 16, cafe: 8, wind: 8 } },
    graveyard:{ n: 'Graveyard', out: 1, d: { wind: 30, birds: 10, drone: 12, bell: 6 }, nt: { night: 34, wind: 32, drone: 16, bell: 6, creaks: 4 } },
    attic:    { n: 'Attic', d: { creaks: 26, wind: 22, drone: 10, brown: 8 } },
    cellar:   { n: 'Cellar or dungeon', d: { drips: 40, drone: 24, creaks: 12, wind: 8 } },
    haunted:  { n: 'Haunted house', d: { creaks: 30, drone: 30, wind: 24, heartbeat: 8, clock: 8 } },
    cave:     { n: 'Underground', d: { drips: 40, drone: 30, wind: 14, creaks: 8 } },
    city:     { n: 'City street', out: 1, d: { cafe: 24, crowd: 18, steps: 8, wind: 10, bell: 8 }, nt: { cafe: 10, crowd: 6, steps: 10, night: 14, wind: 12, bell: 6 } },
    battle:   { n: 'Battle', out: 1, d: { drone: 28, wind: 24, heartbeat: 22, fire: 16, thunder: 8, cannon: 22, clang: 14 } },
    castle:   { n: 'Castle', d: { fire: 36, wind: 20, drone: 14, creaks: 10, bell: 6 } },
    mountain: { n: 'Mountains', out: 1, d: { wind: 55, drone: 8 }, nt: { wind: 50, night: 10, drone: 10 } },
    river:    { n: 'By the river', out: 1, d: { river: 55, birds: 22, wind: 10 }, nt: { river: 50, night: 40, wind: 8 } },
    country:  { n: 'Countryside', out: 1, d: { birds: 38, wind: 16, river: 8 }, nt: { night: 50, wind: 10 } },
    desert:   { n: 'Desert', out: 1, d: { wind: 45, drone: 18, brown: 8 }, nt: { wind: 34, night: 24, drone: 16 } },
    church:   { n: 'Church', d: { drone: 24, bell: 12, clock: 8, brown: 10 } },
    study:    { n: 'Study', d: { brown: 26, clock: 14, fire: 22 } },
    machine:  { n: 'Engine room', d: { engine: 50, drone: 38 } },
    train:    { n: 'On the train', d: { train: 34, engine: 10, creaks: 14, wind: 22 } },
    swamp:    { n: 'Swamp or marsh', out: 1, d: { river: 22, birds: 14, wind: 10, night: 14 }, nt: { night: 52, river: 18, wind: 8 } },
    moor:     { n: 'Moor or heath', out: 1, d: { wind: 48, birds: 10, brown: 8 }, nt: { wind: 46, night: 16, drone: 8 } },
    lighthouse:{ n: 'Lighthouse or cliff', out: 1, d: { waves: 40, wind: 38, birds: 12, bell: 4 }, nt: { waves: 40, wind: 38, bell: 4 } },
    lab:      { n: 'Laboratory', d: { drone: 34, clock: 10, drips: 10, fire: 6 } },
    asylum:   { n: 'Asylum or hospital', d: { drone: 30, drips: 14, clock: 14, creaks: 8, wind: 6 } },
    jungle:   { n: 'Jungle', out: 1, d: { birds: 40, night: 24, river: 20, rain: 12 }, nt: { night: 55, river: 18, rain: 12 } },
    /* Batch 2: Adventure and sea (sea, jungle and cave are above) */
    island:   { n: 'Island', out: 1, d: { waves: 38, birds: 28, wind: 22, rain: 4 }, nt: { waves: 40, night: 34, wind: 18 } },
    beach:    { n: 'Beach', out: 1, d: { waves: 46, birds: 22, wind: 20 }, nt: { waves: 44, night: 18, wind: 18, fire: 6 } },
    cabin:    { n: "Ship's cabin", d: { creaks: 34, waves: 30, wind: 14, drone: 8 } },
    lake:     { n: 'By the lake', out: 1, d: { birds: 34, river: 20, wind: 14, waves: 10 }, nt: { night: 48, river: 14, waves: 10, wind: 8 } },
    harbour:  { n: 'Harbour or dock', out: 1, d: { waves: 34, birds: 26, bell: 8, creaks: 14, cafe: 12, wind: 14 }, nt: { waves: 34, creaks: 16, bell: 8, wind: 16, cafe: 6 } },
    waterfall:{ n: 'Waterfall', out: 1, d: { river: 66, birds: 14, wind: 6 }, nt: { river: 62, night: 22 } },
    reef:     { n: 'Underwater', out: 1, d: { drone: 34, drips: 24, brown: 22, waves: 8 }, nt: { drone: 38, drips: 20, brown: 24 } },
    seastorm: { n: 'Storm at sea', out: 1, d: { waves: 58, wind: 50, thunder: 30, rain: 34, creaks: 14 }, nt: { waves: 58, wind: 50, thunder: 34, rain: 34, creaks: 16 } },
    monsoon:  { n: 'Tropical rain', out: 1, d: { rain: 62, birds: 16, thunder: 12, river: 14 }, nt: { rain: 62, night: 30, thunder: 14, river: 14 } },
    /* Batch 3: Romance and classics (drawing-room is 'hearth', countryside is 'country') */
    ballroom: { n: 'Ballroom', d: { cafe: 46, bell: 6, clock: 8, drone: 10 } },
    garden:   { n: 'Garden', out: 1, d: { birds: 42, wind: 12, river: 6 }, nt: { night: 40, wind: 8 } },
    library:  { n: 'Library', d: { brown: 22, clock: 18, creaks: 8, fire: 10 } },
    village:  { n: 'Village', out: 1, d: { birds: 26, cafe: 16, bell: 8, wind: 10 }, nt: { night: 40, wind: 10, bell: 4 } },
    carriage: { n: 'Carriage ride', out: 1, d: { creaks: 24, wind: 20, hooves: 30, birds: 8 }, nt: { creaks: 24, wind: 20, hooves: 30, night: 14 } },
    theatre:  { n: 'Theatre or opera', d: { cafe: 38, drone: 14, clock: 6 } },
    terrace:  { n: 'Balcony or terrace', out: 1, d: { birds: 22, wind: 18, cafe: 10, bell: 4 }, nt: { night: 38, wind: 14, cafe: 8 } },
    manor:    { n: 'Manor house', d: { clock: 20, fire: 26, creaks: 10, wind: 10, drone: 8 } },
    fair:     { n: 'Village fair', out: 1, d: { crowd: 36, cafe: 14, bell: 8, birds: 10, wind: 8 }, nt: { crowd: 28, cafe: 10, night: 14, bell: 6 } },
    camp:     { n: 'Campfire', out: 1, d: { fire: 40, birds: 14, wind: 12 }, nt: { fire: 44, night: 40, wind: 10 } },
    /* Batches 4 to 8: places the story can name (they match the scenes of the same names in the scene list) */
    school:   { n: 'School', d: { cafe: 35, clock: 22, bell: 10, wind: 5 } },
    market:   { n: 'Market', out: 1, d: { crowd: 40, cafe: 20, wind: 8, bell: 8, birds: 10 }, nt: { crowd: 18, cafe: 10, night: 14, wind: 8 } },
    farm:     { n: 'Farm', out: 1, d: { birds: 35, wind: 15, creaks: 10, river: 8, brown: 6 }, nt: { night: 44, creaks: 10, wind: 12 } },
    orchard:  { n: 'Orchard', out: 1, d: { birds: 42, wind: 22, river: 10, night: 6 }, nt: { night: 46, wind: 18 } },
    court:    { n: 'Police or courtroom', d: { drone: 18, clock: 24, cafe: 14, creaks: 8, bell: 4 } },
    hotel:    { n: 'Hotel', d: { drone: 16, cafe: 22, clock: 14, creaks: 8, bell: 8 } },
    palace:   { n: 'Palace', d: { cafe: 22, drone: 14, clock: 12, bell: 8, wind: 8, birds: 8 } },
    temple:   { n: 'Temple', d: { drone: 30, bell: 16, fire: 14, wind: 14, drips: 8 } },
    tower:    { n: 'Magic tower', d: { wind: 38, drone: 24, fire: 16, creaks: 14, night: 10, bell: 4 } },
    prairie:  { n: 'Prairie', out: 1, d: { wind: 45, birds: 22, brown: 8, river: 6 }, nt: { wind: 40, night: 30, fire: 6 } },
    trench:   { n: 'Trench', out: 1, d: { cannon: 26, thunder: 10, rain: 28, wind: 20, drone: 20, drips: 14, heartbeat: 10 } },
    alley:    { n: 'Dark alley', out: 1, d: { drips: 28, steps: 14, wind: 18, night: 22, drone: 14, cafe: 6 } }
  };
  const SC_WX = {
    rain:  { n: 'rainy', m: { rain: 50 } },
    storm: { n: 'stormy', m: { rain: 42, wind: 45, thunder: 42 } },
    wind:  { n: 'windy', m: { wind: 46 } },
    snow:  { n: 'snowy', m: { wind: 30, drone: 6 } },
    fog:   { n: 'foggy', m: { wind: 10, drone: 14, bell: 6 } }
  };
  const SC_MOOD = {   // m always, i indoors, o outdoors, f = the whole bed gets quieter
    dread:  { n: 'tense', m: { drone: 34, heartbeat: 14, creaks: 18, drips: 6 }, x: { g: 1.1, hp: 130, lp: 9000, i: 1.05 } },   // x = how the whole mix is shaped: g loudness, hp / lp the filter (Hz), i intensity
    danger: { n: 'urgent', m: { heartbeat: 26, drone: 18 }, x: { g: 1.28, hp: 70, lp: 20000, i: 1.2 } },
    peace:  { n: 'peaceful', x: { g: 0.8, hp: 20, lp: 3000, i: 0.85 } },
    sorrow: { n: 'sad', m: { drone: 10, rain: 14 }, x: { g: 0.85, hp: 20, lp: 2400, i: 0.9 } },
    merry:  { n: 'merry', i: { cafe: 14 }, o: { birds: 10 }, x: { g: 1.05, hp: 20, lp: 20000, i: 1.05 } }
  };
  /* Words: [kind, name, weight, words]. A word ending in ! is matched exactly; the others also match their plural and
     -ed / -ing forms. Weight 3 = on its own it names the place, 2 = it helps, 1 = a faint hint. */
  const SC_WORDS = [
    ['p', 'school', 3, 'schoolroom classroom schoolhouse schoolmaster schoolmistress headmaster headmistress blackboard playground schoolboy schoolboys schoolgirl schoolgirls pupils!'],
    ['p', 'school', 2, 'teacher! teachers! lesson! lessons! scholars! slate! slates! desks! school!'],
    ['p', 'market', 3, 'marketplace bazaar stallholder stallholders hawker hawkers costermonger vendors! stalls!'],
    ['p', 'market', 2, 'market! merchant! merchants! haggle haggling wares! barrow! shoppers'],
    ['p', 'farm', 3, 'barn! barns! hayloft cowshed pigsty henhouse sheepfold milkmaid farmhand farmhouse'],
    ['p', 'farm', 2, 'farmer! farmers! cattle! cows! pigs! hens! chickens! sheep! lambs! hay! milking pail! plough plow'],
    ['p', 'orchard', 3, 'orchard! orchards!'],
    ['p', 'orchard', 2, 'apples! pears! plums! blossom! boughs'],
    ['p', 'court', 3, 'courtroom courthouse barrister magistrate bailiff defendant prosecutor jurymen juror jurors'],
    ['p', 'court', 2, 'judge! jury! verdict! sentenced police! constable! constables! sergeant!'],
    ['p', 'hotel', 3, 'hotel hotels receptionist bellboy bellhop concierge chambermaid'],
    ['p', 'hotel', 2, 'lobby! reception! porter! suite! lift!'],
    ['p', 'palace', 3, 'palace palaces chamberlain vizier throne! harem'],
    ['p', 'palace', 1, 'courtiers courtier'],
    ['p', 'palace', 2, 'sultan! emperor! empress! royal! majesty! pages!'],
    ['p', 'temple', 3, 'temple! shrine monastery incense! priestess cloister abbey'],
    ['p', 'temple', 1, 'temples!'],   // also the side of the head
    ['p', 'temple', 2, 'monk! monks! priest! priests! altar! pilgrim! pilgrims! chanting prayers!'],
    ['p', 'tower', 3, 'wizard! wizards! sorcerer sorceress spellbook cauldron enchantress turret'],
    ['p', 'tower', 2, 'wand! wands! spell! spells! witch! potion! potions! runes! tower!'],
    ['p', 'prairie', 3, 'prairie prairies tumbleweed bison! coyote coyotes homestead!'],
    ['p', 'prairie', 2, 'plains! wagon! wagons! grassland grasslands settlers! pioneers!'],
    ['p', 'trench', 3, 'trenches dugout dugouts shellfire sandbags shrapnel bombardment artillery!'],
    ['p', 'trench', 2, 'trench! shells! parapet! rifles!'],
    ['p', 'alley', 3, 'alley! alleys! alleyway backstreet backstreets'],
    ['p', 'alley', 2, 'gutter! cobbled lamppost'],
    ['p', 'forest', 3, 'forest woods! woodland thicket undergrowth glade copse pinewood boughs treetops underbrush'],
    ['p', 'forest', 2, 'trees! trunks! branches! foliage mossy ferns bracken clearing! saplings pines! oaks!'],
    ['p', 'forest', 1, 'leaves! path! moss twigs! bark! deer! fox! squirrel acorns! wood!'],
    ['p', 'sea', 3, 'sea! seas! ocean ship! ships! mast masts! sail sails! schooner voyage harbour! harbor! harbours! harbors! starboard aboard brig frigate galleon anchor'],
    ['p', 'sea', 1.5, 'seaman seamen sailor sailors skipper'],   // a person who works at sea can be met on land ("the brown old seaman"): weaker evidence than the ship itself
    ['p', 'sea', 2, 'deck! waves! captain! crew! helm stern! rigging shore! ashore tide! surf cabin! boat! boats! galley whale! gulls! horizon'],
    ['p', 'sea', 1, 'wave! salt! fleet cargo'],
    ['p', 'tavern', 3, 'tavern inn! alehouse taproom innkeeper tankard tankards barmaid publican saloon pub!'],
    ['p', 'tavern', 1, 'landlord landlady'],   // also a person who lets a house
    ['p', 'tavern', 2, 'ale! beer mug! barkeeper drinking! drunk! tipsy cider! wine! fiddler minstrel drinkers patrons ostler hostess! inns!'],
    ['p', 'tavern', 1, 'bar! glasses! toast! songs!'],
    ['p', 'hearth', 3, 'hearth fireside fireplace chimney parlour parlor armchair kitchen mantelpiece'],
    ['p', 'hearth', 2, 'lamp! candle! candles! curtains! sofa! rug! slippers! teapot kettle! cosy cozy cottage supper! tea!'],
    ['p', 'hearth', 1, 'warm! window! bedroom! stairs!'],
    ['p', 'cave', 3, 'cave cavern catacombs tunnel! tunnels! underground vault! grotto stalactites'],
    ['p', 'cellar', 3, 'cellar dungeon oubliette crypt'],
    ['p', 'cellar', 2, 'shackles manacles fetters chains! gaoler jailer prisoner! cell! cells! turnkey'],
    ['p', 'graveyard', 3, 'graveyard churchyard cemetery gravestone tombstone headstone mausoleum gravedigger sexton'],
    ['p', 'graveyard', 2, 'grave! graves! tomb! tombs! epitaph burial! buried! coffin'],
    ['p', 'graveyard', 1, 'yew! mourners! funeral'],
    ['p', 'attic', 3, 'attic garret rafters cobwebs skylight'],
    ['p', 'attic', 2, 'loft! trunk! trunks! dusty! lumber! beams!'],
    ['p', 'haunted', 3, 'haunted haunting poltergeist spectre specter apparition phantom ghost! ghosts! ghostly'],
    ['p', 'haunted', 2, 'eerie uncanny spectral'],
    ['p', 'haunted', 1, 'abandoned! deserted!'],   // "in good spirits", "deserted the house": not a ghost word
    ['p', 'cave', 2, 'dripping! damp! dank torchlight passage! passages! echoed! echoes! echo!'],
    ['p', 'cave', 1, 'stone! rock! walls!'],
    ['p', 'city', 3, 'street! streets! pavement cobbles cobblestones hansom omnibus pedestrians market! markets! shops! lamp-post'],
    ['p', 'city', 1, 'crowd! crowds! crowded!'],   // a crowd or a crowded table is not a street on its own
    ['p', 'city', 2, 'city! town! traffic hawker bustle shopkeeper alley alleys passers bazaar cab! cabs! carriage! carriages!'],
    ['p', 'city', 1, 'lamps! shop! door!'],
    ['p', 'battle', 3, 'battle! battles! battlefield army! cannon cannons musket muskets cavalry artillery bayonet bayonets siege trenches skirmish warriors'],
    ['p', 'battle', 1, 'regiment regiments'],   // a regiment quartered in a town is not a battle
    ['p', 'battle', 2, 'soldiers! soldier! trumpet! swords! enemy! troops! wounded! shield! arrows! gunfire fought! fighting! rifles volley'],
    ['p', 'battle', 1, 'war! flag! drum! charge! charged!'],
    ['p', 'castle', 3, 'castle castles throne battlements ramparts drawbridge banquet'],
    ['p', 'castle', 2, 'knights! knight! tower! towers! courtyard torches! palace banqueting feast! kingdom!'],
    ['p', 'castle', 1, 'king! queen! lord! lady! crown! hall!'],
    ['p', 'mountain', 3, 'mountain! mountains! glacier summit avalanche blizzard peaks! alpine cliff! cliffs! precipice'],
    ['p', 'mountain', 2, 'snowy! slopes! crag crags! ridge! climbing! altitude rocky!'],
    ['p', 'mountain', 1, 'peak! cold!'],
    ['p', 'river', 3, 'river! rivers! stream! brook! creek! rapids canoe riverbank ford!'],
    ['p', 'river', 2, 'ripple ripples! rushing! raft ferry!'],
    ['p', 'river', 1, 'water! fish! willows! reeds! current! bank!'],
    ['p', 'country', 3, 'meadow meadows! pasture farm! farmyard haystack cornfield hayfield orchard barnyard haymaking'],
    ['p', 'country', 2, 'fields! field! village cottage! barn! sheep! cattle! cows! harvest! hay! lane! hedge! hedgerow hills! valley! shepherd plough! garden!'],
    ['p', 'country', 1, 'sun! grass! flowers! bees! cart!'],
    ['p', 'desert', 3, 'desert! dunes oasis sahara sandstorm'],
    ['p', 'desert', 2, 'camel camels! caravan'],
    ['p', 'desert', 1, 'sand!'],   // sand is the beach's word first
    ['p', 'desert', 2, 'scorching parched arid mirage nomads blazing!'],
    ['p', 'desert', 1, 'heat! thirst! dust!'],
    ['p', 'church', 2, 'church!'],   // "the church" is often the institution (patronage in the church), so on its own it only helps
    ['p', 'church', 3, 'chapel cathedral altar congregation choir! monastery abbey vicar pulpit hymn!'],
    ['p', 'church', 2, 'prayer! prayers! pews sermon chanting! monks! nun! convent worship priest!'],
    ['p', 'church', 1, 'bells! candles! organ!'],
    ['p', 'study', 3, 'manuscript manuscripts scholar parchment quill'],
    ['p', 'study', 2, 'books! desk! professor! ink! papers! volumes! bookshelves shelves! study!'],
    ['p', 'study', 1, 'reading! writing! letters!'],
    ['p', 'machine', 3, 'spaceship starship airlock reactor hyperdrive cockpit spacecraft asteroid'],
    ['p', 'machine', 2, 'engine! engines! machinery turbine boiler! pistons! furnace! dynamo generator! console! hull!'],
    ['p', 'machine', 1, 'metal! lever! gauge!'],
    ['p', 'train', 3, 'railway! locomotive'],
    ['p', 'train', 2, 'train! trains! compartment whistle! stationmaster porter! rails! rattling! sleeper!'],
    ['p', 'train', 1, 'station! platform! ticket!'],
    ['p', 'jungle', 3, 'jungle! jungles! tropical rainforest creepers!'],
    ['p', 'swamp', 3, 'swamp! swamps! marsh! marshes bog! bogs! fen! fens! quagmire bayou mire! morass'],
    ['p', 'swamp', 2, 'reeds! frogs! croaking! mud! will-o-the-wisp stagnant marshy boggy swampy'],
    ['p', 'moor', 3, 'moor! moors! moorland heath! heather! tor! bracken gorse'],
    ['p', 'moor', 2, 'windswept! desolate! barren! bleak! fells!'],
    ['p', 'lighthouse', 3, 'lighthouse lighthouses'],
    ['p', 'lighthouse', 1, 'cliff! cliffs! clifftop headland'],
    ['p', 'lighthouse', 2, 'beacon! foghorn! gulls! crags! rocks!'],
    ['p', 'lab', 3, 'laboratory laboratories chemist! flask! flasks! electrode! galvanic apparatus'],
    ['p', 'lab', 1.5, 'experiment! experiments!'],   // "retort" is also a reply
    ['p', 'lab', 2, 'chemicals! bubbling! specimen! specimens! dissecting dissection scalpel!'],
    ['p', 'asylum', 3, 'asylum asylums hospital! hospitals! infirmary sanatorium ward! wards! madhouse'],
    ['p', 'asylum', 2, 'nurse! nurses!'],   // "a wife to nurse him", "a born nurse": one word is not a hospital
    ['p', 'asylum', 1.5, 'patient! patients!'],   // "be patient"
    ['p', 'asylum', 2, 'physician! surgeon! stretcher! orderly! orderlies! lunatic! lunatics! bedlam'],
    ['p', 'jungle', 2, 'palms! parrot! parrots! monkeys! lianas vines! mangrove humid steaming!'],
    ['p', 'island', 3, 'island! islands! islet castaway castaways lagoon atoll archipelago'],
    ['p', 'island', 2, 'treasure! coconut coconuts! cove! marooned stranded! natives! tropical'],
    ['p', 'island', 1, 'coral! footprint!'],
    ['p', 'beach', 3, 'beach! beaches seashore seaside shoreline seashell seashells! sandcastle'],
    ['p', 'beach', 2, 'sand! pebbles! shells! footprints! paddling! driftwood sunbathing barefoot'],
    ['p', 'beach', 1, 'seagull! seagulls!'],
    ['p', 'cabin', 3, 'cabin! cabins! bunk! bunks! porthole portholes! berth! quarterdeck hammock!'],
    ['p', 'cabin', 2, 'swaying! creaking! rocking!'],
    ['p', 'lake', 3, 'lake! lakes! lakeside lakeshore loch! pond! ponds!'],   // "mere" is mostly the adjective
    ['p', 'lake', 2, 'rowboat rowing! swans! swan! ducks! boating! punt! paddled!'],
    ['p', 'harbour', 3, 'harbour! harbours! harbor! dock! docks! quay quayside wharf! wharves pier! piers! dockyard shipyard'],
    ['p', 'harbour', 2, 'moored mooring! gangplank gangway dockers! longshoremen fishermen! nets! stevedores'],
    ['p', 'waterfall', 3, 'waterfall! waterfalls cascade! cascades! cataract'],
    ['p', 'waterfall', 2, 'gorge! plunging! spray! torrent!'],
    ['p', 'camp', 3, 'campfire! bonfire! campsite! encampment tent! tents! camping'],
    ['p', 'camp', 2, 'embers! sparks! crackling! logs! marshmallows!'],
    ['p', 'reef', 3, 'underwater submarine! reef! reefs! seabed seafloor scuba snorkel snorkelling snorkeling submerged'],
    ['p', 'reef', 2, 'coral! fishes! dolphin! dolphins! shoal! octopus jellyfish! bubbles! sank! sinking! depths!'],
    ['p', 'seastorm', 3, 'shipwrecked! mutiny! capsized capsizing! maelstrom! typhoon'],
    ['p', 'monsoon', 3, 'monsoon! monsoons! cloudburst'],
    ['p', 'monsoon', 2, 'tropical-storm! rainy-season! deluge'],
    ['p', 'ballroom', 3, 'ballroom ballrooms waltz waltzed waltzing! quadrille minuet cotillion chandelier! chandeliers'],
    ['p', 'ballroom', 2, 'dancers! dance-floor'],
    ['p', 'garden', 3, 'garden! gardens! rosebush rosebushes roses! flowerbed flowerbeds gardener! arbour arbor greenhouse conservatory hedges!'],
    ['p', 'garden', 1, 'lawn! lawns!'],   // lawn is also a fine cloth: it is a garden only in a phrase below
    ['p', 'garden', 2, 'blossom! blossoms! petals! lilies! tulips! daisies! fountain! trellis gravel! shrubbery'],
    ['p', 'library', 3, 'library! libraries! librarian bookcase bookcases! bookshelf bookshelves reading-room'],
    ['p', 'library', 2, 'volumes! shelves! catalogue! tomes! leather-bound'],
    ['p', 'village', 3, 'village! villages villager villagers! hamlet! parish! blacksmith! smithy'],
    ['p', 'village', 2, 'cottages! cottagers neighbours! gossip! baker! butcher! thatched'],
    ['p', 'carriage', 3, 'carriage! carriages! coach! coachman! stagecoach hooves! postilion hansom-cab'],
    ['p', 'carriage', 2, 'reins! trotting! galloped! clattered!'],
    ['p', 'theatre', 3, 'theatre! theater! opera! playhouse footlights! orchestra-pit'],
    ['p', 'theatre', 2, 'applause! balcony-seats! overture'],
    ['p', 'terrace', 3, 'terrace! terraces! balcony! veranda verandah! parapet! loggia'],
    ['p', 'manor', 3, 'manor! manors! mansion! mansions! grange! footman! butler! housekeeper!'],
    ['p', 'manor', 2, 'chambermaid! parlourmaid'],
    ['p', 'fair', 3, 'fairground carnival-stall! bazaar-stall merry-go-round! stallholder! maypole'],
    ['p', 'ballroom', 1, 'ball! gown! gowns!'],
    ['p', 'village', 1, 'green! square!'],
    ['p', 'carriage', 1, 'horses! wheels! driver!'],
    ['p', 'theatre', 1, 'stage! audience! curtain! actors!'],
    ['p', 'manor', 1, 'estate! hall! servants!'],
    ['p', 'fair', 1, 'fair! stalls!'],
    ['w', 'rain', 3, 'rain rainy! raindrops drizzle downpour'],
    ['w', 'rain', 2, 'puddles! showers!'],
    ['w', 'rain', 1, 'wet! umbrella! mud! muddy! soaked pouring! drenched'],   // each also has a dry meaning ("pouring out her soul", "drenched in sweat", mud with no rain)
    ['w', 'storm', 3, 'thunder! thunders! lightning! tempest hurricane squall! thunderstorm thunderbolt'],   // "thundered" is a voice, so thunder takes no -ed/-ing forms
    ['w', 'storm', 2, 'storm! storms! stormy! gale! gales! lashed!'],
    ['w', 'storm', 1, 'howling! roaring! thundering! thundered!'],   // wolves and angry men howl and thunder too
    ['w', 'wind', 3, 'windy! breeze breezes! gust gusts!'],
    ['w', 'wind', 2, 'wind! winds! whistling!'],
    ['w', 'wind', 1, 'blew! blowing! rustle rustled!'],
    ['w', 'snow', 3, 'snow! snowing! snowy! snowflakes blizzard sleet frosty!'],
    ['w', 'snow', 2, 'frost! icy! ice! frozen!'],
    ['w', 'fog', 3, 'fog! foggy! mist! misty! haze murk murky! fogbound'],
    ['t', 'night', 3, 'night! nights! midnight moonlight moonlit starlit starry nightfall darkness!'],
    ['t', 'night', 2, 'moon! stars! dusk twilight owl! owls! lantern! lanterns! candlelit torchlit'],
    ['t', 'night', 1, 'dark! evening! shadows!'],
    ['t', 'day', 3, 'morning! sunrise sunshine sunlight noon midday daybreak dawn sunny!'],
    ['t', 'day', 2, 'afternoon! daylight breakfast! sun!'],
    ['t', 'day', 1, 'bright!'],   // bright eyes, a bright idea
    ['m', 'dread', 3, 'dread terror horror ghastly sinister ominous eerie shudder shuddered! ghost! spectre phantom haunted! tomb! coffin! corpse! murder murdered! skeleton!'],
    ['m', 'dread', 2, 'fear! afraid! frightened! trembled! gloom! gloomy! whispered! creeping! lurking! menace uncanny!'],
    ['m', 'dread', 1, 'cold! silent! silence! pale! shiver shivered! grave!'],   // "a grave look" is serious, not dread
    ['m', 'danger', 3, 'chase! chased! pursued! pursuit gunshot pistol! dagger! escape! fled! ambush hunted!'],
    ['m', 'danger', 1, 'ran! running! rushed! shouted!'],   // people run and shout in calm scenes too
    ['m', 'danger', 2, 'pounding! fight! struggle! blood! danger! panic!'],
    ['m', 'peace', 3, 'peaceful! tranquil serene calm! lullaby drowsy'],
    ['m', 'peace', 2, 'sleepy!'],
    ['m', 'peace', 2, 'quiet! gentle! soft! hush! softly! slumber gently! restful lazily!'],
    ['m', 'sorrow', 3, 'grief mourning! funeral! weeping! sobbing! sorrow! widow! deathbed'],
    ['m', 'sorrow', 2, 'lonely!'],
    ['m', 'sorrow', 2, 'wept! sobbed! sad! sadly! despair!'],
    ['m', 'merry', 3, 'merry! feast! dance! dancing! laughter! festival revelry carnival cheerful!'],
    ['m', 'merry', 2, 'laughed! laughing! fiddle! party! celebrated! joyful!'],
    ['m', 'merry', 1, 'music! song! singing!']
  ];
  const SC_PHRASES = [   // phrases: [kind, name, pattern, weight]
    ['p', 'garden', /\b(?:on|across|over|upon|crossed|cross) the lawns?\b|\bgarden lawns?\b|\bmown lawns?\b/, 3],
    ['p', 'study', /\bin the study\b/, 3],
    ['p', 'orchard', /\b(?:in|through|into|under|across) the orchard\b|\bapple[- ]trees?\b/, 4],
    ['p', 'court', /\bin court\b|\bthe (?:court ?room|jury box)\b|\bwitness (?:box|stand)\b|\bpolice (?:station|court)\b|\bscotland yard\b/, 4],
    ['p', 'hotel', /\bthe (?:grand )?hotel\b|\bhotel (?:lobby|room|bar|porter)\b|\bfront desk\b/, 4],
    ['p', 'palace', /\bthe (?:royal )?palace\b|\bthrone ?room\b/, 4],
    ['p', 'temple', /\bthe temple\b|\bincense (?:smoke|burned|filled)\b/, 4],
    ['p', 'tower', /\bwizard'?s tower\b|\bwitch'?s (?:tower|hut)\b|\bhigh tower\b|\btower room\b/, 4],
    ['p', 'prairie', /\b(?:on|across|over) the (?:prairie|plains)\b|\bwagon train\b|\bcovered wagons?\b/, 4],
    ['p', 'trench', /\bin the trench(?:es)?\b|\bno man'?s land\b|\bwestern front\b/, 4],
    ['p', 'alley', /\bdark alley\b|\bin (?:the|an|a) (?:alley|alleyway)\b|\bnarrow (?:alley|lane)\b/, 4],
    ['p', 'school', /\bat school\b|\bthe school(?:room|house|yard)?\b|\bin (?:the|a) classroom\b|\bschool[- ]?bell\b/, 4],
    ['p', 'market', /\bmarket (?:place|square|stalls?|town)\b|\b(?:in|at|through|to) the market\b/, 4],
    ['p', 'farm', /\bthe (?:farm ?yard|barn ?yard|farm ?house)\b|\bon the farm\b|\bin the barn\b|\bmilking time\b/, 4],
    ['p', 'sea', /\b(?:at|out at|on the high|on the open) sea\b|\bhigh seas\b/, 3],
    ['p', 'cabin', /\b(?:ship'?s|captain'?s) cabin\b|\bbelow deck\b|\bin (?:his|her|my|the) (?:berth|bunk)\b/, 4],
    ['p', 'island', /\b(?:desert|treasure|tropical|lonely|coral) island\b|\bwashed (?:up )?ashore\b|\bshipwreck(?:ed)?\b/, 4],
    ['p', 'beach', /\bon the (?:beach|sands)\b|\balong the (?:beach|shore)\b|\bsea ?shore\b/, 4],
    ['p', 'lake', /\bby the lake\b|\bon the lake\b|\blake ?side\b|\bacross the lake\b/, 4],
    ['p', 'harbour', /\bin (?:the )?(?:harbou?r|port)\b|\bon the (?:quay|dock|pier|wharf)\b|\bdown at the docks\b/, 4],
    ['p', 'waterfall', /\b(?:great|roaring|tall) waterfall\b/, 4],
    ['p', 'reef', /\bunder (?:the )?(?:water|sea|waves)\b|\bbeneath the (?:waves|surface)\b|\bbottom of the (?:sea|ocean)\b|\bdeep sea\b/, 4],
    ['p', 'seastorm', /\b(?:storm|gale|tempest|hurricane) at sea\b|\bstorm(?:-| )tossed\b|\bship (?:was )?(?:tossed|battered|lashed)\b|\bwaves (?:crashed|broke) over the (?:deck|bow|ship)\b/, 5],
    ['p', 'monsoon', /\b(?:tropical|monsoon|jungle) (?:rain|storm|downpour)\b|\brain (?:hammered|drummed) on the (?:leaves|palms)\b/, 5],
    ['p', 'ballroom', /\bat the ball\b|\bgrand ball\b|\bball ?room\b|\bdance floor\b|\bled (?:her|him) (?:out )?to (?:dance|the dance)\b/, 5],
    ['p', 'garden', /\bin the (?:rose )?garden\b|\bwalled garden\b|\bgarden (?:path|gate|wall)\b|\bflower garden\b/, 4],
    ['p', 'library', /\bin the library\b|\breading[- ]room\b|\bbooks? lined the walls\b/, 5],
    ['p', 'village', /\bvillage (?:green|street|square|church|inn)\b|\bthe little village\b|\bthrough the village\b/, 4],
    ['p', 'carriage', /\bin the (?:carriage|coach)\b|\bhorse[- ]drawn\b|\bwheels (?:rattled|rolled|clattered)\b|\bhorses'? hooves\b/, 4],
    ['p', 'theatre', /\bat the (?:theatre|theater|opera)\b|\bcurtain (?:rose|fell|went up)\b/, 4],
    ['p', 'terrace', /\bon the (?:balcony|terrace|veranda)\b|\bout onto the (?:balcony|terrace)\b/, 4],
    ['p', 'manor', /\bcountry house\b|\bmanor house\b|\bgreat house\b|\bthe servants'? hall\b/, 4],
    ['p', 'fair', /\bat the fair\b|\bvillage fair\b|\bfun ?fair\b|\bmarket day\b/, 4],
    ['p', 'camp', /\b(?:round|around|by) the (?:camp)?fire\b(?!\s+in\s+the\s+(?:study|room|hall|library|parlou?r|kitchen|drawing|sitting|dining|house|cottage))|\bmade camp\b|\bpitched (?:a |the |our )?tents?\b/, 3],
    ['p', 'castle', /\b(?:great|banqueting|dining) hall\b/, 3],
    ['p', 'lab', /\bmy (?:laboratory|workshop of)\b|\bchemical (?:experiment|apparatus)\b|\bdissecting[- ]room\b/, 4],
    ['p', 'asylum', /\b(?:lunatic|mad|insane) asylum\b|\bsick[- ]?room\b|\bhospital ward\b/, 4],
    ['p', 'lighthouse', /\blight-?house keeper\b/, 4],
    ['p', 'moor', /\bover the (?:moor|heath)\b|\bon the (?:moor|heath)\b/, 4],
    ['p', 'swamp', /\bgrimpen mire\b|\bthrough the (?:marsh|bog|fen)\b/, 4],
    ['p', 'haunted', /\bhaunted (?:house|hall|mansion|manor)\b|\bghost stor(?:y|ies)\b|\bold deserted house\b/, 4],
    ['p', 'attic', /\bunder the (?:roof|eaves)\b|\bup in the loft\b/, 3],
    ['p', 'graveyard', /\b(?:in|through|among) the (?:grave|church)yard\b|\bburial ground\b|\bresting place of the dead\b/, 4],
    ['p', 'cellar', /\b(?:wine|coal) cellar\b|\bprison cell\b|\bdown(?:stairs)? (?:in|into) the cellar\b/, 3],
    ['p', 'hearth', /\b(?:drawing|sitting|dining|living)[- ]room\b|\bby the fire\b/, 3],
    ['p', 'machine', /\bengine[- ]room\b|\bspace ?(?:ship|craft|station)\b/, 4],
    ['p', 'tavern', /\bpublic[- ]house\b|\bcommon[- ]room\b|\bpot[- ]house\b/, 3],
    ['t', 'night', /\bin the dead of night\b|\bat night\b|\bby night\b|\bthat night\b|\bthe night was\b/, 2],
    ['t', 'day', /\bin the morning\b|\bnext morning\b|\bat dawn\b|\bat noon\b|\bin the afternoon\b/, 2],
    ['t', 'night', /\bby (?:nightfall|dusk|sunset)\b|\bat (?:midnight|nightfall|dusk|sunset)\b|\bthat evening\b|\bas (?:dusk|darkness|night|evening) (?:fell|came|descended|closed in|gathered)\b|\bnight (?:fell|came|descended|closed in)\b|\bdusk (?:fell|came|was falling)\b|\bsunset\b|\bsun (?:set|sets|was setting|had set|went down|sank|dipped|slipped)\b|\b(?:moon|moons|stars) (?:rose|rise|rises|came up|came out|appeared|was up|were out)\b|\blater that night\b|\bmidnight\b/, 3],
    ['t', 'day', /\bby (?:dawn|daybreak|morning|sunrise)\b|\bat (?:daybreak|sunrise|first light)\b|\bthe next morning\b|\bthe following (?:morning|day)\b|\bthat morning\b|\bthis morning\b|\bas (?:dawn|day|morning) (?:broke|came|arrived|was breaking)\b|\b(?:dawn|day) (?:broke|came|was breaking)\b|\bsun (?:rose|rises|came up|climbed|broke through|was up|was high)\b|\bfirst light\b|\bmorning (?:came|broke|light)\b/, 3],
    ['w', 'storm', /\bstormy night\b|\bwind and rain\b|\bthunder and lightning\b/, 2],
    ['w', 'rain', /\bin the rain\b|\bpouring with rain\b|\brain (?:fell|beat|beating|poured|came down)\b/, 2],
    ['m', 'dread', /\bdead silence\b|\bblood ran cold\b|\bheart (?:sank|stood still)\b|\bcold sweat\b/, 3]
  ];
  let SC_LEX = null;
  function ambLex() {   // word -> [[kind, name, weight]], built once
    if (SC_LEX) return SC_LEX;
    const M = new Map();
    SC_WORDS.forEach(([kind, name, w, words]) => words.split(/\s+/).filter(Boolean).forEach(raw => {
      const exact = raw.endsWith('!'), base = exact ? raw.slice(0, -1) : raw, forms = new Set([base]);
      if (!exact) {
        forms.add(base + 's'); forms.add(base + 'es'); forms.add(base + 'ed'); forms.add(base + 'ing');
        if (/e$/.test(base)) { forms.add(base + 'd'); forms.add(base.slice(0, -1) + 'ing'); }
        if (/y$/.test(base)) { forms.add(base.slice(0, -1) + 'ies'); forms.add(base.slice(0, -1) + 'ied'); }
      }
      forms.forEach(f => { const a = M.get(f) || []; a.push([kind, name, w]); M.set(f, a); });
    }));
    return (SC_LEX = M);
  }
  function ambSceneIdx(m) {   // the paragraphs of a text model: where each one starts and ends, and which one each sentence is in
    if (m._scn) return m._scn;
    const sents = m.sents, pi = new Int32Array(sents.length), pa = []; let last = null;
    sents.forEach((s, i) => {
      const key = s.h ? 'h' + i : 'p' + s.p;
      if (!last || last.key !== key) { last = { key, a: i, b: i, sc: null }; pa.push(last); } else last.b = i;
      pi[i] = pa.length - 1;
    });
    return (m._scn = { pi, pa, sents });
  }
  /* Negation and endings for place and weather words: "no rain", "without a breeze", "wasn't raining", "the rain stopped",
     "the storm had passed", "after the rain". Only clear patterns count; compounds ("rain-soaked") and
     "no one could ignore the rain" / "never stopped raining" stay positive. */
  const SC_NEG = /(?:^|[^a-z'])(?:no|not|never|without|nor|neither|hardly any|barely any|scarcely any|free of)(?:\s+(?:a|an|any|the|some|even|more|longer|real|really|single|further|much|great|heavy|light|least|slightest|drop|trace|hint|sign|breath|puff|yet|of)){0,3}\s+$|n['\u2019]t\s+(?:(?:a|an|any|the|even|more|longer|really|yet|much)\s+){0,2}$|\bgone (?:were|was) (?:the |all )?$/;
  const SC_AUX = '(?:had|has|have|was|were|is|are|been|finally|at last|soon|suddenly|slowly|gradually|already|now|quite|all|just|long|at length)';
  const SC_ENDED = new RegExp('^(?:\\s+' + SC_AUX + '){0,3}\\s+(?:stopped|ceased|died (?:down|away|out)|let up|passed|cleared|lifted|faded|subsided|gone|no more|ended|blown over|blew over|dried up|moved (?:on|away)|eased|abated|slackened|lessened)\\b(?!\\s+(?:(?:through|across|along|between|into|him|her|them|me|us|the|a|an|his|its|their|my|your|our)\\b|over\\s+\\w|above\\b|beyond\\b))');
  const SC_OVER = new RegExp('^(?:\\s+' + SC_AUX + '){1,3}\\s+over\\b(?!\\s+(?:the|a|an|his|her|their|its|our|my|your|them|us|it|him|me|\\w+ing)\\b)');
  const SC_AFTER = /\b(?:after|following)\s+(?:the|that|this|all the|a)\s+$/;
  const SC_BEGAN = /^\s+(?:had\s+|has\s+)?(?:started|began|begun|hit|struck|broke|set in|came|fell|arrived|returned|resumed|grew|got|became)\b/;
  const SC_FEAR = /^(?:fear\w*|dread\w*|terror|panic\w*|horror|danger\w*|afraid)$/;
  function ambPre(low, idx) {   // the few words before a hit, in the same clause
    return /[^,;:.!?\u2014\u2013()"\u201c\u201d]*$/.exec(low.slice(Math.max(0, idx - 48), idx))[0];
  }
  function ambNegated(low, idx, len, wx) {   // true when a place/weather word is negated or has ended (wx: weather, which also reads "after the rain")
    const end = idx + len;
    if (low.charAt(idx - 1) === '-' || low.charAt(end) === '-') return false;   // rain-soaked, storm-tossed: part of a compound
    const pre = ambPre(low, idx);
    if (SC_NEG.test(pre)) return true;
    const post = low.slice(end, end + 70).split(/[,;:.!?\u2014\u2013]/)[0];
    if (SC_ENDED.test(post) || SC_OVER.test(post)) return true;
    return !!wx && SC_AFTER.test(pre) && !SC_BEGAN.test(post);
  }
  function ambMetaphor(low, idx, len) {   // "a sea of faces", "a storm of grief": the word is a figure of speech, not a place or weather
    if (/\b(?:a|an)\s+$/.test(low.slice(Math.max(0, idx - 4), idx)) && /^\s+of\s+/.test(low.slice(idx + len, idx + len + 8))) return true;
    const w = low.slice(idx, idx + len), pre = low.slice(Math.max(0, idx - 24), idx), post = low.slice(idx + len, idx + len + 30);
    if (w === 'sea' && ((/\b(?:a|an)\s+(?:[a-z-]+\s+){0,2}$/.test(pre) && /^\s+of\b/.test(post)) || /(?<!well\s)\blike\s+(?:an?\s+|the\s+)?$/.test(pre))) return true;   // "a confused sea of red caps", "a pale sea of smoke", "like a sea"
    if (/^(?:sea|ocean|lake|forest)$/.test(w) && (/^[- ]?(?:blue|green|gr[ae]y|colou?red|eyed)\b|^\s+the\s+colou?r of\b/.test(post) || /\b(?:blue|green|gr[ae]y)\s+as\s+(?:the\s+|an?\s+)?$|\bcolou?r of\s+(?:an?\s+|the\s+)?(?:[a-z]+\s+)?$|\beyes?\b[^,.;!?]{0,24}\b(?:like|as|of)\s+(?:the\s+)?$/.test(pre))) return true;   // "her sea-blue eyes", "eyes the colour of the sea": a colour, not a place
    if (/^(?:rain|snow|mist|fog|haze|hail|sleet|clouds?|wind|breeze|gale|frost|dew)$/.test(w) && /(?<!well\s)\b(?:like|than)\s+(?:an?\s+|the\s+)?$|\bas\s+[a-z]+\s+as\s+(?:an?\s+|the\s+)?$/.test(pre)) return true;   // "ran like the wind", "whiter than snow", "swift as the wind": a comparison, not weather
    if (/^(?:sea|ocean|lake|river|forest|mountains?|desert)$/.test(w) && /(?<!well\s)\blike\s+(?:an?\s+|the\s+)?$|\bas\s+[a-z]+\s+as\s+(?:an?\s+|the\s+)?$/.test(pre)) return true;   // "rose like a forest", "waste as the sea": a comparison, not a place
    if (w === 'chimney' && /^[- ](?:pots?|tops?|stacks?)\b/.test(post)) return true;   // "chimney-pots" seen from a roof: not a hearth
    if (/^wards?$/.test(w) && /^\s+off\b/.test(post)) return true;   // "to ward off": a verb, not a hospital ward
    if (/^nurs/.test(w) && (/\bto\s+$/.test(pre) || /^\s+(?:him|her|them|me|you|us|my|his|their)\b/.test(post))) return true;   // "to nurse her baby": a verb, not an asylum
    if (w === 'carriage' && /\bwith\s+(?:the|a|an)\s+$/.test(pre) && /^\s+of\b/.test(post)) return true;   // "with the carriage of a king": how someone holds himself
    if (w === 'thunder') return /\bby\s+(?:the\s+)?(?:living\s+)?$|\bin\s+$|(?<!well\s)\b(?:like|as)\s+(?:an?\s+)?$|\bvoice of\s+$/.test(pre) || (/^\s*$/.test(pre) && /^[!,]/.test(post)) || /^[- ]?struck/.test(post) || /^\s+(?:of\s+(?:their|his|her|its|hoofs?|hooves|the (?:surf|waves|guns?)|surf|waves|guns?|a cannon|cannon|applause)\b|on (?:my|his|her) ear)/.test(post);   // "by thunder!", "thunder-struck", "a voice of thunder", "the thunder of hoofs": an oath or a figure, not a storm
    if (w === 'lightning') return /(?<!well\s)\b(?:like|as|than|from)\s+$|\b(?:struck|stricken|smitten|blasted|tempered|scathed|killed|destroyed|blown up|death) by\s+$|\b(?:like|as)\s+(?:an?\s+)?(?:bolt|flash|streak|thunderbolt)s?\s+of\s+$|\b(?:rapidity|speed|swiftness|quickness|velocity) of\s+$/.test(pre);   // "quick as lightning", "as if struck by lightning", "the rapidity of lightning": an injury or a figure, not a storm
    if (/^(?:tempests?|storms?)$/.test(w) && /(?<!well\s)\b(?:like|as)\s+(?:an?\s+)?$/.test(pre)) return true;   // "raged like a tempest"
    if (w === 'tempest') return /^\s+of\s+(?:passion|rage|anger|fury|worrying|yelping|grief|emotion|feeling|sobs|tears|laughter|applause|words)\b/.test(post);   // "a tempest of passion"
    if (w === 'snow') return /(?<!well\s)\b(?:as|like)\s+$/.test(pre) || /^-white/.test(post);   // "white as snow"
    if (/^haunt/.test(w)) return low.charAt(idx - 1) === '-' || /^\s+(?:me|him|her|them|us|you|my|his|their|by)\b/.test(post);   // "it haunted my dreams", "gloom-haunted": a verb, not a haunted place
    if (w === 'ghost') return /(?<!well\s)\b(?:like|as)\s+(?:an?\s+)?$/.test(pre);   // "pale as a ghost"
    if (w === 'snowy') return /^\s*white/.test(post) || /^[- ]?(?:peaks?|mountains?|summits?|ranges?|heights)\b/.test(post);   // "snowy whiteness", "the snowy peaks": a colour or a view, not snowfall
    return false;
  }
  /* How strong the weather is said to be: "heavy rain", "a light drizzle", "the wind blew hard", "distant thunder". 1 = no word about it;
     above 1 louder, below 1 softer. Looks at the word itself (drizzle, downpour, gale, breeze) and at the word right before or just after it. */
  const INT_W_UP = /^(?:downpour|deluge|torrents?|cloudburst|gales?|hurricane|typhoon|blizzard)$/, INT_W_DOWN = /^(?:drizzle|drizzling|drizzly|mizzle|breezes?|zephyrs?|flurr(?:y|ies)|showers?)$/;
  const INT_UP = /^(?:heavy|torrential|violent|fierce|furious|raging|roaring|howling|driving|pelting|pouring|lashing|battering|terrible|dreadful|tremendous|great|thick|dense|deafening|bitter|mighty|wild|savage|biting|blinding|fearful)$/;
  const INT_DOWN = /^(?:light|gentle|soft|faint|slight|thin|fine|mild|distant|far-off|dying|passing|little)$/;
  const INT_ADV_UP = /^(?:heavily|violently|furiously|fiercely|hard|harder|wildly|savagely|torrents|buckets)$/, INT_ADV_DOWN = /^(?:lightly|softly|gently|faintly|slightly)$/;
  const INT_FN = /^(?:with|of|in|on|at|the|a|an|and|but|as|to|from|for|by|than|so|not|no|it|its|was|were|is|had|has)$/;
  function ambIntensity(low, idx, word) {
    let f = INT_W_UP.test(word) ? 1.4 : INT_W_DOWN.test(word) ? 0.65 : 1, found = false;
    const toks = low.slice(Math.max(0, idx - 40), idx).replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
    for (let k = 1; k <= 2 && toks.length - k >= 0 && !found; k++) {
      const t = toks[toks.length - k]; if (INT_FN.test(t)) break;   // "heavy with rain", "the rain": no modifier
      if (INT_UP.test(t)) { f *= 1.35; found = true; } else if (INT_DOWN.test(t)) { f *= 0.65; found = true; }
    }
    if (!found) {
      const after = low.slice(idx + word.length, idx + word.length + 40).replace(/[,;.]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3);
      for (const t of after) { if (INT_ADV_UP.test(t)) { f *= 1.3; break; } if (INT_ADV_DOWN.test(t)) { f *= 0.7; break; } }
    }
    return Math.round(Math.max(0.45, Math.min(1.6, f)) * 100) / 100;
  }
  function ambMemory(low, idx) {   // the place is only thought of or remembered in this sentence
    const c = Math.max(low.lastIndexOf('.', idx), low.lastIndexOf('!', idx), low.lastIndexOf('?', idx), low.lastIndexOf(';', idx), low.lastIndexOf(':', idx));
    const pre = low.slice(c + 1, idx);
    return /\b(?:thought of|thinking of|thinks of|dream(?:ed|t|s|ing)? of|(?:remember(?:ed|ing|s)?|recall(?:ed|ing|s)?|recollect\w*)(?!\s+(?:that|how|what|to|if|when|where|why|you|me)\b)|longed for|long(?:s|ing) for|memor(?:y|ies) of)\b/.test(pre)
      || /\b(?:write|writing|wrote|written|tell|telling|told|relate|bearings|particulars|map|chart|history|story|tale|account|description)\b(?:\s+[a-z']+){0,4}?\s+(?:of|about|concerning)\s+(?:[a-z']+\s+){0,2}$/.test(pre);   // "to write down the particulars about Treasure Island", "the bearings of the island": the place is what is written about, not where the story is
  }
  function ambSummoned(low, idx) {   // "he can only summon fog and storm and snow": weather that is named as a power or a possibility, not weather that is happening
    return /\b(?:summon(?:s|ed|ing)?|conjur(?:e|es|ed|ing)|call(?:s|ed|ing)? up|command(?:s|ed|ing)? (?:the )?|control(?:s|led|ling)? (?:the )?|can only (?:send|bring|raise|cause))\b[^,;:.!?\u2014\u2013()]*$/.test(ambPre(low, idx));
  }
  function ambTimeRef(low, idx, len) {   // a time word that only refers to another time: "last night", "to-night", "night after night", "the morning before", "good-night", "dark hair"
    const pre = low.slice(Math.max(0, idx - 18), idx), post = low.slice(idx + len, idx + len + 16), w = low.slice(idx, idx + len);
    if (w === 'nights') return true;   // "stormy nights", "two nights ago": habits and counts, not the night of the scene
    if (w === 'night' || w === 'morning' || w === 'evening' || w === 'afternoon') {
      if (/\b(?:last|every|each|yesterday|previous|preceding|bad|two|three|four|five|six|seven|many|several|few|whole|entire|all|spend the|spent the|stay the|pass(?:ed)? the|good)[- ]$/.test(pre) || /\bevery \w+ $/.test(pre) || /\bto-?$/.test(pre) || /\bto[- ]?morrow $/.test(pre)) return true;
      if (/^(?:\s+(?:after|before|through|long|ago|hence|since)\b|['\u2019]s\b)/.test(post)) return true;
    }
    if (w === 'dark' && /^[- ]?(?:hair|haired|eyes|eyed|face|complexion|skin|brow|brows|coloured|colored|man|woman|figure|horse|cloak|suit|dress|clothes|oak)/.test(post)) return true;
    return false;
  }
  function ambNegMood(low, idx, word) {   // moods are only negated for "no fear", "without dread", "not afraid"
    return SC_FEAR.test(word) && SC_NEG.test(ambPre(low, idx));
  }
  /* Quoted speech counts less than narration (x0.45): a character saying "I hate this rain" is weaker evidence than the narrator saying it rained.
     ambQuoteMask marks the characters inside "...", \u201c...\u201d and \u2018...\u2019 (and 'single' speech that starts a sentence or follows a colon/comma);
     st.m carries a quote that is still open into the next sentence of the same paragraph (0 none, 1 double, 2 single).
     An apostrophe (dog's, don't, dogs') never opens a quote, and a single quote only closes after punctuation. */
  const SC_QW = 0.45, SC_TAG = /^(?:said|asked|whispered|shouted|yelled|called|cried|replied|answered|muttered|murmured|exclaimed)$/;
  function ambQuoteMask(t, st) {
    if (!st.m && !/["\u201c\u201d\u201e\u2018']/.test(t)) return null;
    const n = t.length, mk = new Uint8Array(n); let any = 0;
    for (let i = 0; i < n; i++) {
      const c = t[i];
      if (st.m === 0) {
        if (c === '"' || c === '\u201c' || c === '\u201e') { st.m = 1; mk[i] = 1; any = 1; }
        else if (c === '\u2018' || c === "'") {
          const nx = t[i + 1] || '', pv = i ? t[i - 1] : ' ';
          const where = c === '\u2018' ? (!i || /[\s(\u2014\u2013"\u201c]/.test(pv)) : (!i || /[:,]\s$/.test(t.slice(Math.max(0, i - 2), i)));   // the straight ' is also an apostrophe: only trusted where speech starts
          if (where && /[A-Za-z]/.test(nx) && !/^(?:tis|twas|em|cause|til|round|n|im|er|ere|twill|cos)\b/i.test(t.slice(i + 1, i + 7))) { st.m = 2; mk[i] = 1; any = 1; }
        }
      } else {
        mk[i] = 1; any = 1;
        if (st.m === 1) { if (c === '"' || c === '\u201d') st.m = 0; }
        else if (c === '\u2019' || c === "'") { const pv = t[i - 1] || '', nx = t[i + 1] || ''; if (!/[A-Za-z0-9]/.test(nx) && (/[.,!?\u2026;]/.test(pv) || i === n - 1)) st.m = 0; }
      }
    }
    return any ? mk : null;
  }
  /* Genre priors: a small nudge (0.5 to 1) from the book's genres and title, the same text the "Suggested for this book" card reads.
     It only breaks ties: a name gets its prior only when the text already says something about it (score above 0), so the text always wins
     and a prior alone can never start a scene. Rows are [pattern, {kind: {name: prior}}]; kinds p = place, w = weather, t = time, m = mood.
     Edit freely - names must be ones from SC_PLACES / SC_WX / SC_MOOD / night|day. */
  const SC_GENRE = [
    ['horror|supernatural|ghost|vampire|haunt|gothic|macabre|weird|thriller|suspense|mystery|mysteries|detective|crime|murder', { m: { dread: 0.8 }, t: { night: 0.8 }, w: { rain: 0.5 } }],
    ['fantasy|fantastic|fairy|myth|legend|magic|saga', { p: { castle: 0.8, forest: 0.8, hearth: 0.5 } }],   // "fire" is the hearth place
    ['romance|love stor', { p: { hearth: 0.8, tavern: 0.5, country: 0.5 } }],   // cafe = tavern (the cafe sound), garden = country
    ['science fiction|sci-?fi|martian|robot|\\bspace\\b|time machine', { p: { machine: 0.8 } }],
    ['nautical|\\bsea\\b|ocean|pirate|sailor|voyage|marine|moby', { p: { sea: 0.8 } }]
  ];
  const SC_GENRE_RX = SC_GENRE.map(r => [new RegExp(r[0]), r[1]]);
  function ambGenrePrior(b) {   // the prior for a book: {p:{}, w:{}, t:{}, m:{}}, or null with no genre data. Remembered per book once the genres are known.
    if (!b) return null;
    const c = AMB.gp; if (c && c.id === String(b.id)) return c.v;
    const row = String(b.genres || ((typeof CAT !== 'undefined' && CAT.books || []).find(x => x.id === String(b.id)) || {}).genres || '');
    if (!row.trim()) return null;   // no genre data (yet): nothing changes, and nothing is remembered, so a catalog that loads later still counts
    const text = (row + ' ' + (b.title || '')).toLowerCase(); let v = null;
    SC_GENRE_RX.forEach(([rx, pr]) => { if (!rx.test(text)) return; v = v || { p: {}, w: {}, t: {}, m: {} }; for (const d in pr) for (const k in pr[d]) v[d][k] = Math.max(v[d][k] || 0, pr[d][k]); });
    AMB.gp = { id: String(b.id), v };
    return v;
  }
  function ambGenreApply(R, b) {   // adds the prior to what the text said, only where the text said something
    const v = ambGenrePrior(b); if (!v) return R;
    for (const d in v) for (const k in v[d]) if (R[d][k] > 0) R[d][k] += v[d][k];
    return R;
  }
  /* "arrived at the inn", "entered the cave", "stepped into", "walked into", "back at the", "later, in the": the story says it moves.
     The place named right after (a clear one, weight 2+) gets a boost and is remembered as o.go for that paragraph. */
  const SC_LATER = /\b(?:hours|days|weeks|months|years|some time|a while|a little while|a few hours|a few days) later\b/;   // time has passed, which way is not said: the old time of day counts less
  const SC_CHANGE = /\b(?:arrived at|entered|stepped (?:into|inside)|walked into|back (?:at|in) the|later,? in the)\s+(?:(?:the|a|an|his|her|their|our|my)\s+)?((?:[a-z'-]+\s+){0,2}[a-z'-]+)/;
  function ambSceneScore(ix, j) {   // what one paragraph says: scores per kind and name (kept, so a paragraph is read once)
    const e = ix.pa[j]; if (e.sc) return e.sc;
    const o = { p: {}, w: {}, t: {}, m: {}, end: { p: {}, w: {}, t: {} } }, hits = {}, lex = ambLex();
    const ended = (kind, name, w, cap, q) => { const E = o.end[kind]; E[name] = (E[name] || 0) + w * 2 * (q || 1) * (cap ? 0.35 : 1); };   // a negated/ended hit: a mark that takes the scene back out
    const qs = { m: 0 };   // is a quote open? carried from sentence to sentence of this paragraph
    const add = (kind, name, w, cap, q) => {
      const hk = kind + name, n = hits[hk] = (hits[hk] || 0) + 1;
      o[kind][name] = (o[kind][name] || 0) + w * (q || 1) * (cap ? 0.35 : 1) * (n === 1 ? 1 : n === 2 ? 0.8 : n === 3 ? 0.6 : 0.35);   // the first mention counts most
    };
    for (let i = e.a; i <= e.b && i < e.a + 60; i++) {   // a very long paragraph: its first 60 sentences are enough
      const text = ix.sents[i].t || '', low = text.toLowerCase(), lead = text.search(/[A-Za-z]/), re = /[a-z]+/g; let m;
      let qm = ambQuoteMask(text, qs); if (qm && qm.length !== low.length) qm = null;   // (a rare letter that changes length when lowercased: read it as narration)
      const qf = k => (qm && qm[k] ? SC_QW : 1), near = (a, b) => { if (!qm) return false; for (let k = Math.max(0, a - 22); k < Math.min(qm.length, b + 22); k++) if (qm[k]) return true; return false; };
      while ((m = re.exec(low))) {
        const hit = lex.get(m[0]); if (!hit) continue;
        if (SC_TAG.test(m[0]) && near(m.index, m.index + m[0].length)) continue;   // '"Get out," he whispered': a speech tag says who spoke, not what the scene is
        const q = qf(m.index);
        const cap = m.index !== lead && text[m.index] !== low[m.index];   // a capital in mid-sentence is usually a name (Captain Hook)
        let negP, negW, negM, fi;   // looked at once per word, and only when the word is of that kind
        for (const [kind, name, w] of hit) {
          if (kind === 't' && ambTimeRef(low, m.index, m[0].length)) continue;   // "last night", "the night before", "dark hair": not the time of the scene
          if ((kind === 'p' || kind === 'w') && (ambMetaphor(low, m.index, m[0].length) || (kind === 'p' && ambMemory(low, m.index)) || (kind === 'w' && ambSummoned(low, m.index)))) continue;   // "a sea of faces", "a storm of grief", "he thought of the old farm": not where the story is
          if (kind === 'p' || kind === 'w') {
            const ng = kind === 'w' ? (negW == null ? (negW = ambNegated(low, m.index, m[0].length, true)) : negW) : (negP == null ? (negP = ambNegated(low, m.index, m[0].length, false)) : negP);
            if (ng) { ended(kind, name, w, cap, q); continue; }
          } else if (kind === 'm') {
            if (negM == null) negM = ambNegMood(low, m.index, m[0]);
            if (negM) continue;
          }
          if (kind === 'w' && q === 1) { if (fi == null) fi = ambIntensity(low, m.index, m[0]); if (fi !== 1) { const W = o.wi || (o.wi = {}); if (!W[name] || Math.abs(fi - 1) > Math.abs(W[name] - 1)) W[name] = fi; } }   // "heavy rain": how strong, kept beside the score
          add(kind, name, w, cap, q);
        }
      }
      for (const [kind, name, rx, w] of SC_PHRASES) {
        const pm = rx.exec(low); if (!pm) continue;
        if (kind === 'p' && ambMemory(low, pm.index)) continue;   // a place that is only remembered or written about ("the particulars about Treasure Island")
        if ((kind === 'p' || kind === 'w') && ambNegated(low, pm.index, pm[0].length, kind === 'w')) { ended(kind, name, w, false, qf(pm.index)); continue; }
        add(kind, name, w, false, qf(pm.index));
      }
      const lm = SC_LATER.exec(low); if (lm) { ended('t', 'night', 1.5, false, qf(lm.index)); ended('t', 'day', 1.5, false, qf(lm.index)); }
      const cm = SC_CHANGE.exec(low);
      if (cm && qf(cm.index) === 1 && !SC_NEG.test(ambPre(low, cm.index))) {
        let go = '', gw = 1; const lx = ambLex();
        cm[1].split(/\s+/).forEach(wd => (lx.get(wd) || []).forEach(([k, nm, w]) => { if (k === 'p' && w > gw) { go = nm; gw = w; } }));
        for (const [k, nm, rx, w] of SC_PHRASES) if (k === 'p' && w > gw && rx.test(cm[1])) { go = nm; gw = w; }   // "the great hall", "the engine room"
        if (go) { o.go = go; add('p', go, 2, false); }
      }
    }
    return (e.sc = o);
  }
  function ambSceneRead(ix, pi) {   // this paragraph in full, the ones before it with less and less weight
    const tot = { p: {}, w: {}, t: {}, m: {} }, wi = {};
    for (let j = Math.max(0, pi - 5); j <= pi; j++) {   // oldest first: everything already there fades x0.62 per paragraph (same weights as before)
      const s = ambSceneScore(ix, j);
      if (s.wi) for (const k in s.wi) wi[k] = s.wi[k];   // the newest mention of a strength wins
      for (const d in tot) {
        const T = tot[d]; for (const k in T) T[k] *= 0.62;
        for (const k in s[d]) T[k] = (T[k] || 0) + s[d][k];
      }
      for (const d in s.end) for (const k in s.end[d]) if (tot[d][k]) tot[d][k] = Math.max(0, tot[d][k] - s.end[d][k]);   // "the rain stopped": takes the rain out, never below 0
    }
    if (tot.w.storm && tot.w.rain && tot.w.storm >= tot.w.rain * 0.6) tot.w.storm += tot.w.rain * 0.5;   // thunder or a storm with rain in it is a storm, not just rain
    Object.defineProperty(tot, 'wi', { value: wi });
    return tot;
  }
  /* Choose a name from the scores. A new name must be clearly stronger than the current one, and win twice in a row
     (once is enough after a jump or when it is far stronger); a current one that is still faintly there stays. */
  function ambPick(sc, cur, enter, stay, jump, memo, x) {   // x (optional): {mul, add, fast:[mul, add]} - how much stronger a new name must be; default 1.3x+1, and 1.8x+1.5 to skip the second win
    const mul = x ? x.mul : 1.3, add = x ? x.add : 1, fm = x && x.fast ? x.fast[0] : 1.8, fa = x && x.fast ? x.fast[1] : 1.5;
    let top = '', ts = 0; for (const k in sc) if (sc[k] > ts) { ts = sc[k]; top = k; }
    const cs = cur ? (sc[cur] || 0) : 0;
    if (!top || ts < enter) { memo.c = ''; return cur && cs >= stay ? cur : ''; }
    if (!cur || cs < stay) { memo.c = ''; return top; }
    if (top === cur) { memo.c = ''; return cur; }
    if (ts >= cs * mul + add) { if (jump || ts >= cs * fm + fa || memo.c === top) { memo.c = ''; return top; } memo.c = top; }
    return cur;
  }
  /* A place is sticky: it stays while it is even faintly there, and a new one must be 1.8x stronger (and win twice, unless far stronger).
     Exception: a scene-change phrase ("entered the cave") lets the place it names win at once, for this paragraph only. */
  function ambPlacePick(ix, pi, R, cur, jump, memo) {
    const own = ambSceneScore(ix, pi), go = own.go, gs = go ? (R.p[go] || 0) : 0;
    let lead = !!go; if (go) for (const k in own.p) if (k !== go && own.p[k] > own.p[go]) lead = false;   // the named place must also lead this paragraph itself
    if (go && go !== cur && gs >= 3 && lead) { memo.c = ''; return go; }
    return ambPick(R.p, cur, 3, 0.6, jump, memo, { mul: 1.8, add: 0, fast: [2.4, 1.5] });
  }
  /* Scene test (Settings > Developer): runs a list of sample paragraphs through the real scene detection and checks
     each against the scene it should find. A wrong guess is worse than a missed one, so wrong is counted on its own. */
  function sctParse(src) {
    const cases = []; let cur = null, exp = null, buf = [];
    const flush = () => { if (cur && buf.length) { cur.paras.push({ t: buf.join(' '), exp: exp || {} }); exp = null; } buf = []; };
    String(src || '').split(/\r?\n/).forEach(raw => {
      const ln = raw.trim();
      if (ln.startsWith('##')) return;
      if (ln.startsWith('===')) { flush(); const parts = ln.replace(/^=+\s*/, '').split('|').map(x => x.trim()); cur = { id: parts[0] || 'case' + (cases.length + 1), genres: '', trap: false, paras: [] }; parts.slice(1).forEach(x => { if (/^trap$/i.test(x)) cur.trap = true; else { const g = /^genres:\s*(.*)$/i.exec(x); if (g) cur.genres = g[1]; } }); cases.push(cur); exp = null; return; }
      if (!cur) return;
      if (ln.startsWith('#')) { flush(); exp = {}; ln.slice(1).trim().split(/\s+/).forEach(kv => { const i = kv.indexOf('='); if (i > 0) exp[kv.slice(0, i).toLowerCase()] = kv.slice(i + 1).toLowerCase().split('/'); }); return; }
      if (!ln) { flush(); return; }
      buf.push(ln);
    });
    flush();
    return cases;
  }
  function sctRunCase(c) {
    const sents = []; c.paras.forEach((p, i) => { (p.t.match(/[^.!?]+[.!?]+["'\u201d\u2019)]*\s*|[^.!?]+$/g) || [p.t]).forEach(x => { if (x.trim()) sents.push({ t: x.trim(), p: i }); }); });
    const m = { sents }, ix = ambSceneIdx(m), book = c.genres ? { id: 'sct-' + c.id, title: '', genres: c.genres } : null, memo = { p: {}, w: {}, m: {}, t: {} };
    const A = { place: '', wx: '', mood: '', time: '' }, out = [], gp = AMB.gp; let prevPlace = '';
    try {
      c.paras.forEach((p, pi) => {
        const before = A.place, jump = pi === 0, R = ambGenreApply(ambSceneRead(ix, pi), book), n = R.t.night || 0, d = R.t.day || 0;
        A.place = ambPlacePick(ix, pi, R, A.place, jump, memo.p);
        A.wx = ambPick(R.w, A.wx, 3, 1.5, jump, memo.w);
        A.wi = (A.wx && R.wi && R.wi[A.wx]) || 1;
        A.mood = ambPick(R.m, A.mood, 4.5, 2.2, jump, memo.m);
        A.time = ambPick({ night: Math.max(0, n - d * 0.7), day: Math.max(0, d - n * 0.7) }, A.time, 2.5, 1.2, jump, memo.t);
        const got = { place: A.place, weather: A.wx, strength: !A.wx ? 'none' : A.wi > 1.1 ? 'strong' : A.wi < 0.9 ? 'weak' : 'normal', time: A.time, mood: A.mood, trans: A.place && prevPlace && A.place !== prevPlace ? (ambTransKind(prevPlace, A.place) || 'none') : 'none' };
        const sc = { place: R.p, weather: R.w, time: R.t, mood: R.m };
        const checks = Object.keys(p.exp).filter(k => k in got).map(k => {
          const a = got[k] || 'none', ok = p.exp[k].includes(a);
          return { k, want: p.exp[k].join('/'), got: a, st: ok ? 'ok' : a === 'none' ? 'missed' : (k === 'place' && before && a === before) ? 'late' : 'wrong', top: Object.entries(sc[k] || {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(e => e[0] + ' ' + e[1].toFixed(1)).join(', ') };
        });
        out.push({ id: c.id, pi, text: p.t, checks });
        prevPlace = A.place;
      });
    } finally { AMB.gp = gp; }
    return out;
  }
  function sctRun(src) {
    const cases = sctParse(src), rows = [], sum = { cases: cases.length, checks: 0, ok: 0, missed: 0, late: 0, wrong: 0, trapWrong: 0 };
    cases.forEach(c => sctRunCase(c).forEach(r => { r.trap = c.trap; rows.push(r); r.checks.forEach(k => { sum.checks++; sum[k.st]++; if (k.st === 'wrong' && c.trap) sum.trapWrong++; }); }));
    return { rows, sum };
  }
  function sctKeyMap(rows) { const o = {}; rows.forEach(r => r.checks.forEach(k => { o[r.id + '#' + r.pi + '#' + k.k] = { g: k.got, s: k.st }; })); return o; }
  function sctDiff(rows, base) {   // against the saved baseline: what is newly wrong, what got fixed, what changed
    const cur = sctKeyMap(rows), d = { newWrong: [], fixed: [], changed: [] };
    if (!base) return null;
    for (const k in cur) { const b = base[k]; if (!b) { if (cur[k].s === 'wrong') d.newWrong.push(k); continue; } if (cur[k].s === 'wrong' && b.s !== 'wrong') d.newWrong.push(k); else if (b.s === 'wrong' && cur[k].s !== 'wrong') d.fixed.push(k); else if (b.g !== cur[k].g) d.changed.push(k); }
    return d;
  }
  function sctReport(res, diff) {
    const s = res.sum, L = [];
    L.push(s.cases + ' cases, ' + s.checks + ' checks: ' + s.ok + ' ok, ' + s.missed + ' missed, ' + s.late + ' late, ' + s.wrong + ' wrong (' + s.trapWrong + ' in trap cases)');
    L.push(diff ? 'Against baseline: ' + diff.newWrong.length + ' new wrong, ' + diff.fixed.length + ' fixed, ' + diff.changed.length + ' changed. ' + (diff.newWrong.length ? 'FAIL' : 'PASS') : 'No baseline saved yet. ' + (s.wrong ? 'FAIL' : 'PASS') + ' (no wrong guesses allowed)');
    ['wrong', 'late', 'missed'].forEach(st => { const list = []; res.rows.forEach(r => r.checks.forEach(k => { if (k.st === st) list.push('[' + st.toUpperCase() + '] ' + r.id + ' para ' + (r.pi + 1) + ' ' + k.k + ': wanted ' + k.want + ', got ' + k.got + (k.top ? ' (scores: ' + k.top + ')' : '') + ' | ' + r.text.slice(0, 70)); })); if (list.length) { L.push(''); list.forEach(x => L.push(x)); } });
    return L.join('\n');
  }
  function sctInit() {
    const ta = $('#sct-src'); if (!ta) return;
    const builtin = () => (($('#scene-tests') || {}).textContent || '').replace(/^\n/, '');
    let saved = null; try { saved = localStorage.getItem('wt:sct-src'); } catch (e) {}
    ta.value = saved != null ? saved : builtin();
    ta.addEventListener('input', () => { try { localStorage.setItem('wt:sct-src', ta.value); } catch (e) {} });
    let res = null, txt = '';
    const run = () => { try { let base = null; try { base = JSON.parse(localStorage.getItem('wt:sct-base') || 'null'); } catch (e) {} if (!base) { try { base = JSON.parse(($('#scene-baseline') || {}).textContent || 'null'); } catch (e) {} } /* no baseline of your own yet: compare with the one that shipped */ res = sctRun(ta.value); txt = sctReport(res, sctDiff(res.rows, base)); $('#sct-out').textContent = txt; } catch (e) { $('#sct-out').textContent = 'The test could not run: ' + e.message; } };
    $('#sct-run').addEventListener('click', run);
    $('#sct-base').addEventListener('click', () => { if (!res) run(); if (!res) return; try { localStorage.setItem('wt:sct-base', JSON.stringify(sctKeyMap(res.rows))); toast('Baseline saved.'); } catch (e) { toast('Could not save the baseline.'); } });
    $('#sct-copy').addEventListener('click', async () => { if (!txt) run(); try { await navigator.clipboard.writeText(txt); toast('Report copied.'); } catch (e) { toast('Could not copy.'); } });
    $('#sct-reset').addEventListener('click', () => { ta.value = builtin(); try { localStorage.removeItem('wt:sct-src'); } catch (e) {} toast('Sample cases restored.'); });
  }
  function ambSceneMix(A, conf) {   // place + weather + time + mood become one set of levels
    const L = {}; AMB_SOUNDS.forEach(([k]) => { L[k] = 0; });
    const put = (m, f) => { for (const k in m) if (k in L) L[k] = Math.max(L[k], m[k] * (f == null ? 1 : f)); };
    const pl = SC_PLACES[A.place], out = !pl || !!pl.out, night = A.time === 'night', wet = A.wx === 'rain' || A.wx === 'storm' || A.wx === 'snow';
    if (pl) put(night && pl.nt ? pl.nt : pl.d);
    if (A.wx) { const w = SC_WX[A.wx].m, fi = A.wi || 1; for (const k in w) if (k in L) L[k] = Math.max(L[k], w[k] * fi * (out ? 1 : k === 'thunder' ? 0.8 : 0.5)); }   // indoors the weather is heard through the walls
    if (wet) { L.birds *= 0.15; L.night *= 0.4; } else if (A.wx === 'fog') L.birds *= 0.6;
    const md = SC_MOOD[A.mood];
    if (md) { if (md.m) put(md.m); if (out && !wet && md.o) put(md.o); if (!out && md.i) put(md.i); }
    AMB_SOUNDS.forEach(([k]) => { L[k] = Math.max(0, Math.min(100, Math.round(L[k] * conf))); });
    return L;
  }
  function ambMoodShape() {   // {g, hp, lp, i}: loudness, high-pass and low-pass (Hz) and intensity for the whole mix
    const A = AMB.auto, md = A && !A.hold && P.ambAuto !== false && A.mood && !A.fix ? SC_MOOD[A.mood] : null, x = md && md.x, s = md ? (A.ms || 0.7) : 0;
    if (!x) return { g: 1, hp: 20, lp: 20000, i: 1 };
    return { g: 1 + (x.g - 1) * s, i: 1 + (x.i - 1) * s, hp: 20 * Math.pow(x.hp / 20, s), lp: 20000 * Math.pow(x.lp / 20000, s) };   // filters blend on a log scale, as hearing does
  }
  function ambMoodApply(tc) {
    if (!AMB.built || !AMB.mg) return;
    const sh = ambMoodShape(), t = AMB.ctx.currentTime, c = (tc || 0.15) * 1.3;
    AMB.mg.gain.setTargetAtTime(sh.g, t, c); AMB.mhp.frequency.setTargetAtTime(sh.hp, t, c); AMB.mlp.frequency.setTargetAtTime(sh.lp, t, c);
  }
  function ambBase() {   // the levels everything is built from: the scene being read, or the reader's own mix
    const A = AMB.auto;
    if (P.ambAuto === false || !A || A.hold || !A.L) return ambLevels();
    return A.L;
  }
  /* "Wrong scene?": the reader's corrections, per book, in P.ambFix[bookId] = { n: sentences in the text, c: [[paragraph, scene key or '-'], ...] }.
     '-' means "no scene here". At most 200 per book (the oldest go first) and 60 books, like the saved mixes. A correction rules the paragraph it was made
     on and the 3 paragraphs either side of it; if the book's text changes (n differs) the old corrections are ignored. */
  const AMB_FIX_MAX = 200, AMB_FIX_NEAR = 3;
  function ambFixGet(m) {
    if (!S.book || !m || !m.sents) return null;
    const e = (P.ambFix || {})[String(S.book.id)];
    return e && e.n === m.sents.length && Array.isArray(e.c) ? e : null;
  }
  function ambFixNear(m, pi) {   // the correction that applies to this paragraph (the closest; the newer one on a tie), or null
    const e = ambFixGet(m); if (!e) return null;
    let best = null, bd = 99;
    e.c.forEach(x => { const d = Math.abs(x[0] - pi); if (d <= AMB_FIX_NEAR && d <= bd) { bd = d; best = { p: x[0], k: x[1] }; } });
    return best;
  }
  function ambFixStore(id, n, pi, k) {   // pure bookkeeping on P: add or replace a correction, cap it, keep the newest books
    P.ambFix = P.ambFix || {}; id = String(id);
    let e = P.ambFix[id]; if (!e || e.n !== n || !Array.isArray(e.c)) e = { n, c: [] };
    e.c = e.c.filter(x => x[0] !== pi); e.c.push([pi, k]);
    if (e.c.length > AMB_FIX_MAX) e.c.splice(0, e.c.length - AMB_FIX_MAX);
    delete P.ambFix[id]; P.ambFix[id] = e;
    const ks = Object.keys(P.ambFix); if (ks.length > 60) delete P.ambFix[ks[0]];
    return e;
  }
  function ambFixRedo() { const A = AMB.auto; if (A) { A.refix = true; A.sig = ''; } ambAutoStep(); }
  function ambFixAdd(k) {   // k: a scene key from AMB_SCENES, or '-' for no scene
    const A = AMB.auto, m = S.model;
    if (!S.book || !A || !m || A.model !== m || !(A.pi >= 0)) { toast('Nothing to correct yet. Play a little first.'); return; }
    ambFixStore(S.book.id, m.sents.length, A.pi, k); savePrefs();
    const sc = k === '-' ? null : AMB_SCENES.find(x => x.k === k);
    ambFixRedo(); ambFixPaint();
    toast(k === '-' ? 'Noted: no scene here. Your own mix plays around this part.' : 'Noted: \u201c' + (sc ? sc.n : k) + '\u201d for this part of the story.');
  }
  function ambFixClear() {
    if (!S.book || !(P.ambFix || {})[String(S.book.id)]) return;
    delete P.ambFix[String(S.book.id)]; savePrefs(); ambFixRedo(); ambFixPaint();
    toast('Corrections cleared for this book.');
  }
  function ambFixPaint() {   // the button row: only with scenes on; the clear link only when this book has corrections
    const row = $('#amb-fixrow'); if (!row) return;
    row.hidden = P.ambAuto === false || !S.book;
    const e = S.book ? (P.ambFix || {})[String(S.book.id)] : null, clr = $('#amb-fix-clear'); if (clr) clr.hidden = !(e && e.c && e.c.length);
    if (P.ambAuto === false) { const pk = $('#amb-wrong-pick'); if (pk) pk.hidden = true; }
  }
  function ambFixChips() {   // the scene list plus "No scene here"
    const box = $('#amb-wrong-chips'); if (!box) return;
    box.textContent = '';
    AMB_SCENES.forEach(sc => box.append(h('button', { class: 'chip', type: 'button', 'data-k': sc.k }, sc.n)));
    box.append(h('button', { class: 'chip', type: 'button', 'data-k': '-' }, 'No scene here'));
  }
  /* Chapter titles, the whole chapter, and a look ahead. The text model holds the whole book, headings included, so:
     (1) a chapter's title counts extra for its first few paragraphs ("The Saloon" sets the scene before the prose does);
     (2) each chapter is scored a few paragraphs at a time in the background, so a chapter whose first paragraphs name no
         place opens in the place the chapter is mostly set in;
     (3) on the last sentence of a paragraph, a place named in the next paragraph (or in the next chapter's title) starts
         to count, so the crossfade begins a moment before the story gets there. */
  function ambChapIdx(ix) {   // per chapter: its heading paragraph (hp), first (a) and last (b) paragraph
    if (ix.cx) return ix.cx;
    const cx = {};
    ix.pa.forEach((e, j) => { const st = ix.sents[e.a]; if (!st) return; const c = cx[st.ch] || (cx[st.ch] = { hp: null, a: j, b: j }); c.b = j; if (st.h && c.hp == null) c.hp = j; });
    return (ix.cx = cx);
  }
  function ambChapScan(ix, ch) {   // score a chapter's paragraphs a dozen at a time (they are kept, so reading them later costs nothing), then the next chapter
    const c = ambChapIdx(ix)[ch]; if (!c || c.done || c.busy) return;
    c.busy = true; c.sum = {}; let j = c.a; const end = Math.min(c.b, c.a + 400);
    const run = () => {
      try { for (let n = 0; n < 12 && j <= end; n++, j++) { const sc = ambSceneScore(ix, j); for (const k in sc.p) c.sum[k] = (c.sum[k] || 0) + Math.min(sc.p[k], 4); } } catch (e) { j = end + 1; }
      if (j <= end) { setTimeout(run, 40); return; }
      c.busy = false; c.done = true;
      let top = '', ts = 0, sec = 0; for (const k in c.sum) { const v = c.sum[k]; if (v > ts) { sec = ts; ts = v; top = k; } else if (v > sec) sec = v; }
      c.top = top && ts >= 6 && ts >= sec * 1.5 ? top : '';   // one place has to clearly lead, or the chapter has no single place
      try {
        const A = AMB.auto, id = S.curId, cur = A && A.model && A.model._scn === ix && id != null && ix.sents[id] ? ix.sents[id].ch : null;
        if (cur === ch && c.top && !A.place && !A.hold) { A.refix = true; A.sig = ''; ambAutoStep(); }   // the chapter just opened with no place yet: the scan has one
        if (cur === ch) ambChapScan(ix, ch + 1);
      } catch (e) { /* the scan is only a help */ }
    };
    setTimeout(run, 0);
  }
  function ambChapBoost(ix, id, pi, R, look) {   // adds to the place scores; true when this paragraph is a chapter heading
    const st = ix.sents[id], c = st && ambChapIdx(ix)[st.ch]; if (!c) return false;
    const d = c.hp == null ? 99 : pi - c.hp;
    if (d >= 0 && d <= 4) { const hs = ambSceneScore(ix, c.hp).p, w = [1.6, 1.3, 1, 0.7, 0.4][d]; for (const k in hs) R.p[k] = (R.p[k] || 0) + hs[k] * w; }
    if (c.done && c.top && pi - (c.hp == null ? c.a - 1 : c.hp) <= 2) {   // the first paragraphs often name no place: open in the chapter's own
      let best = 0; for (const k in R.p) if (R.p[k] > best) best = R.p[k];
      if (best < 3) R.p[c.top] = Math.max(R.p[c.top] || 0, 3.2);
    }
    if (look && ix.pa[pi + 1]) {
      const nx = ambSceneScore(ix, pi + 1), nw = ix.sents[ix.pa[pi + 1].a].h ? 1.2 : 0.6;
      for (const k in nx.p) R.p[k] = (R.p[k] || 0) + nx.p[k] * nw;
      if (nx.go) R.p[nx.go] = (R.p[nx.go] || 0) + 2;
    }
    return d === 0;
  }
  function ambAutoStep() {   // called when the reader moves to a new sentence; does the work only when the paragraph changes
    AMB.autoId = S.curId; AMB.autoSec = S.sec;
    try {
      const m = S.model, id = S.curId; if (!m || !m.sents || id == null || id < 0 || !m.sents[id]) return;
      const ix = ambSceneIdx(m), pi = ix.pi[id];
      const A = AMB.auto || (AMB.auto = { place: '', wx: '', time: '', mood: '', L: null, hold: false, holdSig: '', pi: -9, model: null, memo: {}, sig: '' });
      if (pi != null && ix.sents[id].ch != null) ambChapScan(ix, ix.sents[id].ch);   // (does nothing once the chapter has been scanned)
      const look = pi != null && A.model === m && A.pi === pi && !A.refix && A.look !== pi && P.ambLook !== false && ix.pa[pi].b === id && !!ix.pa[pi + 1];   // the last sentence of a paragraph: look at the next one
      if (pi == null || (A.model === m && A.pi === pi && !A.refix && !look)) return;
      A.refix = false; if (look) A.look = pi;
      let jump = A.model !== m || Math.abs(pi - A.pi) > 1; const skipped = jump; A.model = m; A.pi = pi;   // skipped: the reader jumped (seek, new book), so no transition sound
      const R = ambGenreApply(ambSceneRead(ix, pi), S.book); if (ambChapBoost(ix, id, pi, R, look)) jump = true;   // a new chapter may start in a new place
      const mm = A.memo, n = R.t.night || 0, d = R.t.day || 0, t0 = A.time;
      const place0 = A.place;
      A.place = ambPlacePick(ix, pi, R, A.place, jump, mm.p || (mm.p = {}));
      if (!look) {   // (the look ahead is for places only: weather, time and mood wait for their own paragraph)
        A.wx = ambPick(R.w, A.wx, 3, 1.5, jump, mm.w || (mm.w = {}));
        A.wi = (A.wx && R.wi && R.wi[A.wx]) || 1;   // how strong the weather is said to be
        A.mood = ambPick(R.m, A.mood, 4.5, 2.2, jump, mm.m || (mm.m = {}));
        A.time = ambPick({ night: Math.max(0, n - d * 0.7), day: Math.max(0, d - n * 0.7) }, A.time, 2.5, 1.2, jump, mm.t || (mm.t = {}));
      }
      if (A.hold && A.place + '|' + A.wx !== A.holdSig) A.hold = false;   // the story has moved on: the scene takes over again
      const flip = A.time !== t0; if (flip) ambTod(true, true);   // day <-> night in the story: the night softening eases in or out over several seconds
      const fx0 = ambFixNear(m, pi), fsc = fx0 && fx0.k !== '-' ? AMB_SCENES.find(x => x.k === fx0.k) : null, fx = fx0 && (fx0.k === '-' || fsc) ? fx0 : null;   // a correction from the reader: a strong prior that rules this paragraph and its neighbours
      A.fix = fx ? { k: fx.k, n: fsc ? fsc.n : '' } : null;
      const sig = [A.place, A.wx, A.time, A.mood, fx ? fx.k : '', A.wi || 1].join('|'); if (sig === A.sig) return;
      A.sig = sig;
      if (place0 && A.place && A.place !== place0) ambTrans(place0, A.place, look ? id + 1 : id, look, skipped);   // the story moved to a new place: a door, gate or footsteps
      const top = Math.max(R.p[A.place] || 0, R.w[A.wx] || 0, (R.m[A.mood] || 0) * 0.8), conf = Math.max(0.6, Math.min(1, 0.6 + 0.4 * top / 9));   // a faint scene is a quieter one
      A.ms = A.mood ? Math.max(0.5, Math.min(1, 0.5 + 0.5 * (R.m[A.mood] || 0) / 9)) : 0;   // a mood the text only hints at shapes the mix less
      A.L = fx ? (fsc ? ambFull(fsc.L) : null) : (A.place || A.wx || A.mood) ? ambSceneMix(A, conf) : null;
      ambAutoPaint();
      if (AMB.built && AMB.on) ambApply(flip ? 4 : jump ? 1.2 : 2.4);   // a slow crossfade: the old bed fades out as the new one fades in
      if (MUS.on) musicMoodChange(A.mood || '');
    } catch (e) { console.warn('scene detection', e); }   // never let it break reading
  }
  function ambAutoHold() {   // the reader moved a slider or picked a scene: their mix plays until the story changes place
    const A = AMB.auto; if (P.ambAuto === false || !A || !A.L || A.hold) return;
    A.hold = true; A.holdSig = A.place + '|' + A.wx; ambAutoPaint();
  }
  function ambAutoPaint() {
    const el = $('#amb-auto-st'); if (!el) return;
    ambFixPaint();
    const A = AMB.auto;
    if (P.ambAuto === false) { el.textContent = 'Off. The sounds stay as you set them.'; miniScenePaint(null); return; }
    if (A && A.hold) { el.textContent = 'Your own mix is playing until the story moves to a new place.'; miniScenePaint(null); return; }
    if (A && A.fix) { el.textContent = A.fix.k === '-' ? 'Corrected: no scene here. Your own mix plays.' : 'Corrected: ' + A.fix.n + '.'; miniScenePaint(A.fix.k !== '-' ? A.fix.n : null); return; }
    if (A && A.L) {
      const bits = [A.place ? SC_PLACES[A.place].n : (A.wx ? SC_WX[A.wx].n.charAt(0).toUpperCase() + SC_WX[A.wx].n.slice(1) : 'Atmosphere')];
      if (A.place && A.wx) bits.push(SC_WX[A.wx].n);
      if (A.time === 'night') bits.push('night');
      if (A.mood) bits.push(SC_MOOD[A.mood].n);
      const label = 'Now: ' + bits.join(' \u00b7 ');
      el.textContent = label; miniScenePaint(label); return;
    }
    el.textContent = 'Listening for the next scene. Between scenes your own mix plays.';
    miniScenePaint(null);
  }

  /* Scene label on the mini-player: shown only when P.sceneLabel is true and a scene is active. */
  function miniScenePaint(label) {
    const btn = $('#mini-scene'); if (!btn) return;
    const show = P.sceneLabel === true && !!label && P.ambOn === true && AMB.on;
    btn.hidden = !show;
    if (show) btn.textContent = label;
  }
