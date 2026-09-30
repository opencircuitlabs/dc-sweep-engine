export class DCSweepError extends Error{constructor(message){super(message);this.name='DCSweepError';}}

export function solveOperatingPoint(circuit){
  validateCircuit(circuit);
  const ground=circuit.ground??'0';
  const usedNodes=new Set(circuit.components.flatMap(component=>[component.from,component.to]));
  const nodes=[...usedNodes].filter(node=>node!==ground);
  const nodeIndex=new Map(nodes.map((node,index)=>[node,index]));
  const branchComponents=circuit.components.filter(component=>component.type==='voltage-source'||component.type==='inductor');
  const branchIndex=new Map(branchComponents.map((component,index)=>[component.id,nodes.length+index]));
  const size=nodes.length+branchComponents.length;
  const matrix=Array.from({length:size},()=>Array(size).fill(0));
  const rhs=Array(size).fill(0);
  const ni=node=>node===ground?undefined:nodeIndex.get(node);
  const stampConductance=(from,to,conductance)=>{const i=ni(from),j=ni(to);if(i!==undefined)matrix[i][i]+=conductance;if(j!==undefined)matrix[j][j]+=conductance;if(i!==undefined&&j!==undefined){matrix[i][j]-=conductance;matrix[j][i]-=conductance;}};
  const stampCurrent=(from,to,current)=>{const i=ni(from),j=ni(to);if(i!==undefined)rhs[i]-=current;if(j!==undefined)rhs[j]+=current;};
  const stampBranch=(component,value)=>{const k=branchIndex.get(component.id),i=ni(component.from),j=ni(component.to);if(i!==undefined){matrix[i][k]+=1;matrix[k][i]+=1;}if(j!==undefined){matrix[j][k]-=1;matrix[k][j]-=1;}rhs[k]=value;};
  for(const component of circuit.components){
    if(component.type==='resistor')stampConductance(component.from,component.to,1/component.resistance);
    else if(component.type==='switch'&&component.closed)stampConductance(component.from,component.to,1/(component.onResistance??1e-6));
    else if(component.type==='switch'&&!component.closed&&component.offResistance!==undefined)stampConductance(component.from,component.to,1/component.offResistance);
    else if(component.type==='current-source')stampCurrent(component.from,component.to,component.current);
    else if(component.type==='voltage-source')stampBranch(component,component.voltage);
    else if(component.type==='inductor')stampBranch(component,0);
  }
  if(size===0)return{analysis:'dc-operating-point',nodeVoltages:{[ground]:0},componentCurrents:{},componentPowers:{},totalAbsorbedPower:0};
  const solution=solveLinear(matrix,rhs);const voltage=node=>node===ground?0:solution[nodeIndex.get(node)];
  const nodeVoltages=Object.fromEntries([ground,...nodes].map(node=>[node,clean(voltage(node))]));
  const componentCurrents={},componentPowers={};let totalAbsorbedPower=0;
  for(const component of circuit.components){
    const v=voltage(component.from)-voltage(component.to);let current=0;
    if(component.type==='resistor')current=v/component.resistance;
    else if(component.type==='switch')current=component.closed?v/(component.onResistance??1e-6):component.offResistance===undefined?0:v/component.offResistance;
    else if(component.type==='current-source')current=component.current;
    else if(component.type==='voltage-source'||component.type==='inductor')current=solution[branchIndex.get(component.id)];
    componentCurrents[component.id]=clean(current);componentPowers[component.id]=clean(v*current);totalAbsorbedPower+=v*current;
  }
  return{analysis:'dc-operating-point',nodeVoltages,componentCurrents,componentPowers,totalAbsorbedPower:clean(totalAbsorbedPower)};
}

export function sweepDC(circuit,{sweeps,maxPoints=10000}={}){
  if(!Array.isArray(sweeps)||sweeps.length<1||sweeps.length>3)throw new DCSweepError('sweeps must contain one to three sweep definitions');
  const axes=sweeps.map(createSweepAxis);const pointCount=axes.reduce((product,axis)=>product*axis.values.length,1);
  if(!Number.isInteger(maxPoints)||maxPoints<1)throw new DCSweepError('maxPoints must be a positive integer');
  if(pointCount>maxPoints)throw new DCSweepError(`sweep requires ${pointCount} points; maximum is ${maxPoints}`);
  const componentMap=new Map(circuit.components?.map(component=>[component.id,component])??[]);
  for(const axis of axes){const [id,field]=parseTarget(axis.target);const component=componentMap.get(id);if(!component)throw new DCSweepError(`sweep target component not found: ${id}`);validateSweepField(component,field,axis.values);}
  const points=[];
  const visit=(depth,settings)=>{
    if(depth===axes.length){const candidate=structuredClone(circuit);for(const [target,value] of Object.entries(settings))setTarget(candidate,target,value);points.push({settings:{...settings},...solveOperatingPoint(candidate)});return;}
    const axis=axes[depth];for(const value of axis.values)visit(depth+1,{...settings,[axis.target]:value});
  };
  visit(0,{});
  return{analysis:'dc-sweep',axes,pointCount,points};
}

export function createSweepAxis(definition){
  if(!definition||typeof definition.target!=='string')throw new DCSweepError('each sweep requires a target');
  let values;
  if(Array.isArray(definition.values)){values=definition.values.map(Number);if(values.length===0)throw new DCSweepError(`${definition.target} values cannot be empty`);}
  else{
    const {start,stop}=definition;if(!Number.isFinite(start)||!Number.isFinite(stop))throw new DCSweepError(`${definition.target} requires finite start and stop values`);
    if(definition.points!==undefined){if(!Number.isInteger(definition.points)||definition.points<1)throw new DCSweepError(`${definition.target} points must be a positive integer`);values=definition.points===1?[start]:Array.from({length:definition.points},(_,index)=>start+(stop-start)*index/(definition.points-1));}
    else{const step=definition.step;if(!Number.isFinite(step)||step===0||Math.sign(stop-start)!==Math.sign(step))throw new DCSweepError(`${definition.target} step does not approach stop`);const count=Math.floor((stop-start)/step+1e-12)+1;values=Array.from({length:count},(_,index)=>start+step*index);if(Math.abs(values.at(-1)-stop)>Math.abs(step)*1e-9)values.push(stop);}
  }
  if(values.some(value=>!Number.isFinite(value)))throw new DCSweepError(`${definition.target} contains a non-finite value`);
  return{target:definition.target,values};
}

export function solveLinear(matrix,vector,tolerance=1e-12){const n=vector.length;if(matrix.length!==n||matrix.some(row=>row.length!==n))throw new DCSweepError('matrix dimensions must match vector');const a=matrix.map((row,index)=>[...row,vector[index]]);for(let column=0;column<n;column++){let pivot=column;for(let row=column+1;row<n;row++)if(Math.abs(a[row][column])>Math.abs(a[pivot][column]))pivot=row;if(Math.abs(a[pivot][column])<=tolerance)throw new DCSweepError('circuit has no unique DC solution; check floating nodes and source conflicts');[a[column],a[pivot]]=[a[pivot],a[column]];const divisor=a[column][column];for(let index=column;index<=n;index++)a[column][index]/=divisor;for(let row=0;row<n;row++){if(row===column)continue;const factor=a[row][column];for(let index=column;index<=n;index++)a[row][index]-=factor*a[column][index];}}return a.map(row=>clean(row[n]));}

export function column(result,target){if(!result||result.analysis!=='dc-sweep')throw new DCSweepError('column requires a DC sweep result');const [group,id]=target.split('.');if(!['nodeVoltages','componentCurrents','componentPowers'].includes(group)||!id)throw new DCSweepError('column target must be nodeVoltages.ID, componentCurrents.ID, or componentPowers.ID');return result.points.map(point=>{const value=point[group]?.[id];if(value===undefined)throw new DCSweepError(`result target not found: ${target}`);return value;});}

function parseTarget(target){const match=/^([A-Za-z][\w-]*)\.(voltage|current|resistance|onResistance|offResistance)$/.exec(target);if(!match)throw new DCSweepError(`invalid sweep target: ${target}`);return[match[1],match[2]];}
function setTarget(circuit,target,value){const[id,field]=parseTarget(target),component=circuit.components.find(item=>item.id===id);component[field]=value;}
function validateSweepField(component,field,values){const allowed={"voltage-source":['voltage'],"current-source":['current'],resistor:['resistance'],switch:['onResistance','offResistance']}[component.type]??[];if(!allowed.includes(field))throw new DCSweepError(`${component.id}.${field} cannot be swept for ${component.type}`);if(['resistance','onResistance','offResistance'].includes(field)&&values.some(value=>value<=0))throw new DCSweepError(`${component.id}.${field} sweep values must be positive`);}
function validateCircuit(circuit){if(!circuit||!Array.isArray(circuit.nodes)||!Array.isArray(circuit.components))throw new DCSweepError('circuit requires nodes and components arrays');const ground=circuit.ground??'0',nodes=new Set(circuit.nodes.map(node=>node.id));if(!nodes.has(ground))throw new DCSweepError('ground node is missing');const supported=new Set(['resistor','capacitor','inductor','voltage-source','current-source','switch']),ids=new Set();for(const component of circuit.components){if(!component.id||ids.has(component.id))throw new DCSweepError('component ids must be unique');ids.add(component.id);if(!supported.has(component.type))throw new DCSweepError(`unsupported component type "${component.type}"`);if(!nodes.has(component.from)||!nodes.has(component.to))throw new DCSweepError(`${component.id} references an unknown node`);if(component.from===component.to)throw new DCSweepError(`${component.id} connects a node to itself`);for(const field of ['resistance','capacitance','inductance','onResistance','offResistance'])if(component[field]!==undefined&&(!Number.isFinite(component[field])||component[field]<=0))throw new DCSweepError(`${component.id}.${field} must be positive`);for(const field of ['voltage','current'])if(component[field]!==undefined&&!Number.isFinite(component[field]))throw new DCSweepError(`${component.id}.${field} must be finite`);}}
function clean(value){return Math.abs(value)<1e-15?0:value;}
