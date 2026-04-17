"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce"; // Will create this

interface FilterProps {
  categories: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}

export function InventoryFilters({ categories, clients }: FilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Controlled states for immediate UI feedback
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const debouncedQuery = useDebounce(query, 500);

  // Helper to update query string
  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set("page", "1"); // Reset to page 1 on filter
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  // Sync debounced search to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debouncedQuery) {
      if (params.get("q") !== debouncedQuery) {
        params.set("q", debouncedQuery);
        params.set("page", "1");
        router.push(`?${params.toString()}`);
      }
    } else if (params.has("q")) {
      params.delete("q");
      params.set("page", "1");
      router.push(`?${params.toString()}`);
    }
  }, [debouncedQuery, router, searchParams]);

  const clearFilters = () => {
    setQuery("");
    router.push("?");
  };

  return (
    <div className="bg-white p-4 rounded-xl border flex flex-wrap gap-4 items-end">
      {/* Search */}
      <div className="flex-1 min-w-[200px] space-y-1">
        <Label>Search</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Tag ID or Label..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Status */}
      <div className="w-[180px] space-y-1">
        <Label>Status</Label>
        <Select 
          value={searchParams.get("status") || "all"} 
          onValueChange={(val) => setFilter("status", val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="out">Out</SelectItem>
            <SelectItem value="rewash">Rewash</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category */}
      <div className="w-[180px] space-y-1">
        <Label>Category</Label>
        <Select 
          value={searchParams.get("category") || "all"} 
          onValueChange={(val) => setFilter("category", val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Client */}
      <div className="w-[180px] space-y-1">
        <Label>Client</Label>
        <Select 
          value={searchParams.get("client") || "all"} 
          onValueChange={(val) => setFilter("client", val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Wash Cycle */}
      <div className="w-[180px] space-y-1">
        <Label>Wash Cycle</Label>
        <Select 
          value={searchParams.get("cycle") || "all"} 
          onValueChange={(val) => setFilter("cycle", val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All Cycles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="normal">Normal (&lt;160)</SelectItem>
            <SelectItem value="near_eol">Near EOL (160-180)</SelectItem>
            <SelectItem value="critical">Critical (&gt;180)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(searchParams.toString().length > 0) && (
        <Button variant="ghost" onClick={clearFilters} className="text-slate-500 hover:text-slate-900">
          <X className="w-4 h-4 mr-2" />
          Clear
        </Button>
      )}
    </div>
  );
}
