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
