export const terrainRank = terrain => ({preview:0,quick:1,full:2}[terrain?.quality??'full']??-1);
export const terrainCanReplace = (current,next) => !current || terrainRank(next)>=terrainRank(current);
