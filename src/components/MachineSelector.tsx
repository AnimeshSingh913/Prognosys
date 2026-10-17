import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface MachineSelectorProps {
  machines: number[];
  value: number | null;
  onChange: (value: number) => void;
  className?: string;
}

export function MachineSelector({
  machines,
  value,
  onChange,
  className,
}: MachineSelectorProps) {
  return (
    <Select 
      value={value !== null ? value.toString() : undefined} 
      onValueChange={(val) => onChange(Number(val))}
    >
      <SelectTrigger className={cn("w-full sm:w-[200px] bg-card", className)}>
        <SelectValue placeholder="Select Machine" />
      </SelectTrigger>
      <SelectContent className="bg-card border-border max-h-[300px]">
        {machines.map((machine) => (
          <SelectItem key={machine} value={machine.toString()}>
            Engine {machine}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

