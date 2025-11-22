import { Select as SelectPrimitive } from 'bits-ui';
import Select from './select.svelte';
import SelectItem from './select-item.svelte';

const SelectContent = SelectPrimitive.Content;
const SelectTrigger = SelectPrimitive.Trigger;
const SelectValue = SelectPrimitive.Value;

export {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
};