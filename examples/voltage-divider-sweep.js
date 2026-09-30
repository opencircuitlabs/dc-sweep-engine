import {column,sweepDC} from '../src/index.js';
const circuit={ground:'0',nodes:[{id:'0'},{id:'in'},{id:'out'}],components:[{id:'V1',type:'voltage-source',from:'in',to:'0',voltage:0},{id:'R1',type:'resistor',from:'in',to:'out',resistance:1000},{id:'R2',type:'resistor',from:'out',to:'0',resistance:2000}]};
const result=sweepDC(circuit,{sweeps:[{target:'V1.voltage',start:0,stop:12,step:2}]});
console.table(result.points.map((point,index)=>({input:point.settings['V1.voltage'],output:column(result,'nodeVoltages.out')[index]})));
