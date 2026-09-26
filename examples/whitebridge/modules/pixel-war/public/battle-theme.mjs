// Iron, weathered stone and ash. Saturated color is reserved for faction control
// and combat, rather than painting every biome a different primary color.
export const FACTIONS={
 human:{color:'#328fff',ink:'#8cc8ff',roof:'#354651',trim:'#658296'},
 demon:{color:'#ff8a2c',ink:'#f3b17a',roof:'#4d4038',trim:'#987456'}
};
export const MATERIALS={
 void:'#252c2e',stone:'#747974',shade:'#454c4d',light:'#92958a',
 wood:'#76634e',dark:'#292f32',brass:'#b9a16b',panel:'#1b252ded',paper:'#e7e1d5'
};
// Terrain index: grass, road, forest, hill, water, rock, ford, tree, rubble, barrier.
// Biomes vary in value and warmth, inside the same low-saturation palette.
export const TERRAIN_PALETTES={
 border:['#51564c','#70695a','#3e4a43','#646860','#30444d','#606863','#8b9289','#3e4a43','#454540','#51564c'],
 pine:  ['#48534e','#6b665a','#374740','#5d655f','#30444d','#606863','#8b9289','#374740','#414640','#48534e'],
 ash:   ['#56534d','#716758','#454b46','#67645c','#30444d','#606863','#8b9289','#454b46','#47443f','#56534d'],
 stone: ['#565c57','#716c60','#404c45','#696e66','#30444d','#606863','#8b9289','#404c45','#484c47','#565c57'],
 meadow:['#535c4d','#746c5b','#414e43','#666d60','#30444d','#606863','#8b9289','#414e43','#484c41','#535c4d'],
 wheat: ['#5e6050','#766e5c','#485145','#706f60','#30444d','#606863','#8b9289','#485145','#504e42','#5e6050']
};
export const COMMON_TERRAIN={1:'#746c5d',4:'#304650',5:'#606763',6:'#858e85'};
