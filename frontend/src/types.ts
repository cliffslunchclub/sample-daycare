export type Code = 'standard'|'A'|'B'|'C'|'V'|null;
export interface User {id:string;name:string;email:string;role:'super'|'staff'|'location';locationId:string}
export interface Location {id:string;name:string;rateCents:number;sizes:boolean;substitutions:boolean;classrooms:string[];menu:string[];pizzaDay:number}
export interface Version {effective:string;active:boolean;classroom:string;size:string;billing:'school'|'clc'|'subsidized';days:Code[];allergy?:string;instructions?:string}
export interface Student {id:string;name:string;locationId:string;versions:Version[];exceptions:{date:string;code:Code}[]}
export interface Meal {studentId:string;name:string;classroom:string;size:string;code:Exclude<Code,null>;billing:Version['billing'];allergy:string;instructions:string}
export interface Closure {locationId:string;date:string;note:string}
export interface Adjustment {id:string;locationId:string;month:string;units:number;note:string;by:string;at:string;deleted:boolean}
export interface Note {id:string;locationId:string;month:string;note:string;by:string;at:string;status:string;reply:string;adjustmentId:string|null}
export interface Counts {total:number;standard:number;substitutions:number;school:number;clc:number;subsidized:number;pizzas:number}
export interface Projection {month:string;locationId:string;scheduled:number;adjustments:Adjustment[];adjustmentUnits:number;billable:number;rateCents:number;subtotalCents:number;days:({date:string}&Counts)[]}
export interface Invoice extends Projection {id:string;at:string;by:string}
export interface Workspace {user:User;users:User[];locations:Location[];students:Student[];closures:Closure[];adjustments:Adjustment[];notes:Note[];invoices:Invoice[];codes:Record<string,string>;audit:{id:string;at:string;actor:string;action:string;locationId:string;details:unknown}[];demo:boolean}
