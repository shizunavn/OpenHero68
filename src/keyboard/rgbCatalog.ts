// IDs from the stock vendor catalog; event capabilities from fw0320 handlers.
const names=['Off','Static','Breathing','Rainbow','Reactive','Starry','Ripple','Key Ripples','Raindrops','Snowflakes','Continuous Flow','Windmill','Follow Shadow','Light Wave','Scan','Rotating Circle','Waterfall','Bloom','Spinning Storm','Per-key Color']
export const KEY_RGB_MODES=names.map((name,id)=>({id,name,reactive:[4,7,9,12].includes(id),color:![0,3,19].includes(id),speed:![0,1,19].includes(id)}))
export const SIDE_RGB_MODES=['Off','Rainbow','Color Cycle','Static','Breathing','Bounce'].map((name,id)=>({id,name,reactive:false,color:![0,1,2].includes(id),speed:![0,3].includes(id)}))
export const RGB_SERVICE_AVAILABLE=false
