"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, CheckCircle2, Loader2, PenLine } from "lucide-react";
import { SignatureCanvas } from "./SignatureCanvas";
import { format } from "date-fns";

interface ManifestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: any;
  routeId: string;
  stopIndex: number;
  onSigned: () => void;
}

export function ManifestDialog({ open, onOpenChange, stop, routeId, stopIndex, onSigned }: ManifestDialogProps) {
  const [signature, setSignature] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSign = async () => {
    if (!signature || !signedBy) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/routes/${routeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stopIndex,
          status: "delivered",
          signature,
          signed_by: signedBy,
        }),
      });
      if (!res.ok) throw new Error("Failed to sign");
      onSigned();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const isSigned = stop.status === 'delivered' || !!stop.signature;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Printable Area */}
        <div id="printable-manifest" className="p-4 bg-white text-slate-900 printable-only">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tighter">LAUNDRYTRACK</h1>
              <p className="text-sm text-slate-500">Professional RFID Management</p>
            </div>
            <div className="text-right">
              <h2 className="font-bold text-lg">DELIVERY MANIFEST</h2>
              <p className="text-sm text-slate-600">Date: {format(new Date(), "MMM dd, yyyy")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Customer</p>
              <p className="font-bold">{stop.client_name}</p>
              <p className="text-sm text-slate-600">{stop.address || "No Address Provided"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Route Info</p>
              <p className="text-sm">Batch: OUT-{routeId.slice(-6).toUpperCase()}</p>
              <p className="text-sm">Stop Order: #{stopIndex + 1}</p>
            </div>
          </div>

          <table className="w-full mb-8 border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-2 text-sm">Item Category</th>
                <th className="text-right py-2 text-sm">Quantity</th>
                <th className="text-right py-2 text-sm">Unit</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-3 text-sm">General Linens (Mixed)</td>
                <td className="py-3 text-sm text-right font-medium">{stop.item_count}</td>
                <td className="py-3 text-sm text-right">PCS</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="py-4">TOTAL ITEMS</td>
                <td className="py-4 text-right">{stop.item_count}</td>
                <td className="py-4 text-right">PCS</td>
              </tr>
            </tfoot>
          </table>

          <div className="grid grid-cols-2 gap-12 mt-12 pt-8 border-t border-slate-100">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-4">Recipient Signature</p>
              {isSigned ? (
                <div className="space-y-2">
                  <img src={stop.signature} alt="Signature" className="h-16 object-contain" />
                  <p className="text-sm font-bold border-t border-slate-200 pt-1">{stop.signed_by}</p>
                </div>
              ) : (
                <div className="h-24 bg-slate-50 rounded flex items-center justify-center border-2 border-dashed border-slate-200">
                  <p className="text-slate-300 text-sm">Pending Signature</p>
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-4">Dispatcher</p>
              <div className="h-24 flex items-end justify-end">
                <p className="text-sm font-bold border-t border-slate-200 pt-1 w-full text-right">Authorized Fleet Member</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Panel (Hidden on Print) */}
        {!isSigned && (
          <div className="bg-slate-50 p-6 rounded-xl border space-y-4 no-print mt-6">
            <h3 className="font-bold flex items-center gap-2">
              <PenLine className="w-4 h-4" /> E-Signature Required
            </h3>
            <div className="space-y-2">
              <Label htmlFor="receiver-name">Receiver Name</Label>
              <Input 
                id="receiver-name"
                placeholder="Full Name" 
                value={signedBy} 
                onChange={(e) => setSignedBy(e.target.value)} 
              />
            </div>
            <SignatureCanvas onSave={setSignature} />
          </div>
        )}

        <DialogFooter className="no-print pt-4 border-t gap-2 sm:gap-0">
          <Button variant="outline" onClick={handlePrint} className="flex-1 sm:flex-none">
            <Printer className="w-4 h-4 mr-2" /> Print Manifest
          </Button>
          {!isSigned && (
            <Button 
                onClick={handleSign} 
                className="flex-1 sm:flex-none" 
                disabled={!signature || !signedBy || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Sign & Confirm Delivery
            </Button>
          )}
          {isSigned && (
            <div className="flex items-center text-green-600 font-bold bg-green-50 px-4 py-2 rounded-lg border border-green-200">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Signed & Completed
            </div>
          )}
        </DialogFooter>

        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-manifest, #printable-manifest * {
              visibility: visible;
            }
            #printable-manifest {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              padding: 0 !important;
              margin: 0 !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
