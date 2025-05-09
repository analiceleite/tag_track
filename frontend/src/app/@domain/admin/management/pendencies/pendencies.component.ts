import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { BackToMenuComponent } from '../../../../@common/components/back-to-menu/back-to-menu.component';
import { LoadingComponent } from '../../../../@common/components/loading/loading.component';
import { 
    Client, 
    ClientPendencies, 
    PurchaseWithUI, 
    PaymentMethod, 
    PurchaseTab,
    PurchaseGroup 
} from '../../../../@services/models/purchase.interface';
import { PurchaseService } from '../../../../@services/api/purchase/purchase.service';
import { WhatsappService } from '../../../../@services/whatsapp/whatsapp.service';
import { forkJoin } from 'rxjs';

@Component({
    selector: 'app-pendencies',
    standalone: true,
    imports: [
        CommonModule,
        MatTableModule,
        MatButtonModule,
        MatIconModule,
        FormsModule,
        BackToMenuComponent,
        LoadingComponent, // Add this line
    ],
    templateUrl: './pendencies.component.html'
})
export class PendenciesComponent implements OnInit {
    isLoading: boolean = true;
    clients: ClientPendencies[] = [];
    displayedColumns: string[] = ['name', 'purchases'];
    selected_tab: PurchaseTab = 'open';
    paymentMethods: PaymentMethod[] = [];
    selectedPaymentMethodId: number | null = null;
    filter: string = '';
    selected_client_cpf: string | null = null;

    showTrackingDialog: boolean = false;
    trackingCode: string = '';
    selectedGroupDate?: string;
    selectedClientCpf?: string;

    constructor(
        private purchaseService: PurchaseService, 
        private router: Router,
        private whatsappService: WhatsappService
    ) { }

    ngOnInit(): void {
        this.loadPendencies();
    }

    private loadPendencies(): void {
        this.isLoading = true;
        
        // Usando forkJoin para esperar todas as requisições
        const pendencies$ = this.purchaseService.loadPendencies();
        const paymentMethods$ = this.purchaseService.loadPaymentMethods();
        
        forkJoin({
            pendencies: pendencies$,
            paymentMethods: paymentMethods$
        }).subscribe({
            next: ({ pendencies, paymentMethods }) => {
                this.clients = pendencies.map(client => {
                    const purchasesByDate = client.purchases.reduce((groups, purchase) => {
                        const date = purchase.created_at?.split('T')[0] || 'No Date';
                        if (!groups[date]) {
                            groups[date] = [];
                        }
                        groups[date].push({
                            ...purchase,
                            showPaymentOptions: false,
                            showDeleteOption: false,
                            tracking_code: purchase.tracking_code || '',
                        });
                        return groups;
                    }, {} as { [key: string]: PurchaseWithUI[] });

                    const purchase_groups = Object.entries(purchasesByDate).map(([date, purchases]) => ({
                        date,
                        purchases,
                        total_amount: purchases.reduce((total, p) => total + parseFloat(p.price || '0'), 0),
                        is_paid: purchases.every(p => p.is_paid),
                        is_delivery_sent: purchases.every(p => p.is_delivery_sent),
                        is_deleted: purchases.every(p => p.is_deleted),
                        is_delivery_asked: purchases.some(p => p.is_delivery_asked),
                        delivery_requested: purchases.some(p => p.is_delivery_asked), 
                        payment_method: purchases.find(p => p.payment_method)?.payment_method,
                        tracking_code: purchases.find(p => p.tracking_code)?.tracking_code || '',
                        showPaymentOptions: false,
                        showDeleteOption: false,
                        isExpanded: false 
                    }));

                    const clientPendencies: ClientPendencies = {
                        client: client.client,
                        cpf: client.cpf,
                        phone: client.phone,
                        total_amount: purchase_groups.reduce((total, group) => total + group.total_amount, 0),
                        purchases: client.purchases.map(p => ({
                            ...p,
                            showPaymentOptions: false,
                            showDeleteOption: false
                        })),
                        purchase_groups,
                        delivery_requested: client.purchases.some(p => p.is_delivery_asked)
                    };

                    return clientPendencies;
                });

                this.paymentMethods = paymentMethods;
                if (this.paymentMethods.length > 0) {
                    this.selectedPaymentMethodId = this.paymentMethods[0].id;
                }
            },
            error: (error) => {
                console.error('Erro ao carregar dados:', error);
            },
            complete: () => {
                this.isLoading = false;
            }
        });
    }

    showPaymentOptions(purchaseId: number): void {
        this.clients.forEach(client => {
            client.purchases.forEach(purchase => {
                if (purchase.id !== purchaseId) {
                    purchase.showPaymentOptions = false;
                }
            });
        });

        const purchase = this.findPurchaseById(purchaseId);
        if (purchase) {
            purchase.showPaymentOptions = !purchase.showPaymentOptions;
        }
    }

    markAsPaid(purchaseId: number, paymentMethodType: 'Nubank' | 'PicPay'): void {
        const paymentMethodId = paymentMethodType === 'Nubank' ? 1 : 2;

        this.purchaseService.markAsPaid(purchaseId, paymentMethodId).subscribe(() => {
            const purchase = this.findPurchaseById(purchaseId);
            if (purchase) {
                purchase.showPaymentOptions = false;
                purchase.is_paid = true;
                purchase.payment_method = paymentMethodType;
            }

            const client = this.findClientByPurchaseId(purchaseId);
            if (client) {
                client.payment_method = paymentMethodType;
            }

            this.loadPendencies();
        });
    }

    markAsUnpaid(purchaseId: number): void {
        this.purchaseService.markAsUnpaid(purchaseId).subscribe(() => {
            const purchase = this.findPurchaseById(purchaseId);
            if (purchase) {
                purchase.is_paid = false;
                purchase.payment_method = '';
            }

            this.loadPendencies();
        });
    }

    markAsSent(purchaseId: number): void {
        this.purchaseService.markAsSent(purchaseId).subscribe(() => {
            const purchase = this.findPurchaseById(purchaseId);
            if (purchase) {
                purchase.is_delivery_sent = true;
            }

            this.loadPendencies();
        });
    }

    markAsNotSent(purchaseId: number): void {
        this.purchaseService.markAsNotSent(purchaseId).subscribe(() => {
            const purchase = this.findPurchaseById(purchaseId);
            if (purchase) {
                purchase.is_delivery_sent = false;
            }

            this.loadPendencies();
        });
    }

    markAsDeleted(purchaseId: number): void {
        const purchase = this.findPurchaseById(purchaseId);
        if (purchase) {
            purchase.showDeleteOption = false;
        }
        
        this.purchaseService.masAsDeleted(purchaseId).subscribe(() => {
            if (purchase) {
                purchase.is_deleted = true;
            }
            this.loadPendencies();
        });
    }

    returnToOpen(purchaseId: number): void {
        this.purchaseService.markAsUndeleted(purchaseId).subscribe(() => {
            this.purchaseService.markAsNotSent(purchaseId).subscribe(() => {
                this.purchaseService.markAsUnpaid(purchaseId).subscribe(() => {
                    const purchase = this.findPurchaseById(purchaseId);
                    if (purchase) {
                        purchase.is_paid = false;
                        purchase.is_delivery_sent = false;
                        purchase.is_deleted = false || true;
                        purchase.payment_method = '';
                    }

                    this.selected_tab = 'open';

                    this.loadPendencies();
                });
            });
        });
    }

    returnGroupToOpen(date: string, clientCpf: string): void {
        const client = this.clients.find(c => c.cpf === clientCpf);
        const group = client?.purchase_groups.find(g => g.date === date);
        
        if (group) {
            const promises = group.purchases.map(purchase => 
                this.purchaseService.returnToOpen(purchase.id || purchase.purchase_id).toPromise()
            );

            Promise.all(promises).then(() => {
                group.is_paid = false;
                group.is_delivery_sent = false;
                group.is_deleted = false;
                group.payment_method = '';
                group.tracking_code = '';
                this.selected_tab = 'open';
                this.loadPendencies();
            });
        }
    }

    private findPurchaseById(purchaseId: number): PurchaseWithUI | null {
        for (const client of this.clients) {
            const purchase = client.purchases.find(p => p.id === purchaseId || p.purchase_id === purchaseId);
            if (purchase) return purchase;
        }
        return null;
    }

    private findClientByPurchaseId(purchaseId: number): ClientPendencies | null {
        return this.clients.find(client =>
            client.purchases.some(purchase => purchase.id === purchaseId || purchase.purchase_id === purchaseId)
        ) || null;
    }

    toggleSelectedClient(cpf: string): void {
        this.selected_client_cpf = this.selected_client_cpf === cpf ? null : cpf;
    }

    getFilteredClients(): ClientPendencies[] {
        return this.clients
            .map(client => ({
                ...client,
                purchase_groups: client.purchase_groups.filter(group => {
                    switch (this.selected_tab) {
                        case 'open':
                            return !group.is_paid && !group.is_delivery_sent && !group.is_deleted;
                        case 'sent':
                            return group.is_paid && !group.is_delivery_sent && !group.is_deleted;
                        case 'completed':
                            return group.is_paid && group.is_delivery_sent && !group.is_deleted;
                        case 'deleted':
                            return group.is_deleted;
                        default:
                            return true;
                    }
                })
            }))
            .filter(client => {
                const matchesFilter = !this.filter ||
                    client.client.toLowerCase().includes(this.filter.toLowerCase()) ||
                    client.cpf.toLowerCase().includes(this.filter.toLowerCase());
                return matchesFilter && client.purchase_groups.length > 0;
            });
    }

    getTotalAmount(client: ClientPendencies): number {
        return client.total_amount;
    }

    hasDeliveryRequested(client: ClientPendencies): boolean {
        return client.delivery_requested === true;
    }

    getPaymentMethod(client: ClientPendencies): string | null {
        return client.payment_method || null;
    }

    gotToNewPurchase(): void {
        this.router.navigate(['/cadastro-compras']);
    }

    getOpenCount(): number {
        return this.clients.reduce((count, client) => {
            return count + client.purchases.filter(purchase => !purchase.is_paid && !purchase.is_delivery_sent).length;
        }, 0);
    }

    getSentCount(): number {
        return this.clients.reduce((count, client) => {
            return count + client.purchases.filter(purchase => purchase.is_paid && !purchase.is_delivery_sent).length;
        }, 0);
    }

    getCompletedCount(): number {
        return this.clients.reduce((count, client) => {
            return count + client.purchases.filter(purchase => purchase.is_paid && purchase.is_delivery_sent).length;
        }, 0);
    }

    sendWhatsAppMessage(client: ClientPendencies): void {
        if (!client.phone) {
            alert('Cliente não possui telefone cadastrado!');
            return;
        }
        
        const message = this.whatsappService.generatePendingItemsMessage(client);
        const phoneNumber = client.phone.replace(/\D/g, '');
        const formattedPhone = phoneNumber.startsWith('55') ? phoneNumber : `55${phoneNumber}`;
        
        window.open(`https://wa.me/${formattedPhone}?text=${message}`);
    }

    markGroupAsPaid(date: string, clientCpf: string, paymentMethodType: 'Nubank' | 'PicPay'): void {
        const client = this.clients.find(c => c.cpf === clientCpf);
        const group = client?.purchase_groups.find(g => g.date === date);
        
        if (group) {
            group.showPaymentOptions = false; 
            const paymentMethodId = paymentMethodType === 'Nubank' ? 1 : 2;
            const markPaidPromises = group.purchases.map(purchase =>
                this.purchaseService.markAsPaid(purchase.id || purchase.purchase_id, paymentMethodId).toPromise()
            );

            Promise.all(markPaidPromises).then(() => {
                group.is_paid = true;
                group.payment_method = paymentMethodType;
                this.loadPendencies();
            });
        }
    }

    markGroupAsSent(date: string, clientCpf: string): void {
        const client = this.clients.find(c => c.cpf === clientCpf);
        const group = client?.purchase_groups.find(g => g.date === date);
        
        if (group) {
            const markSentPromises = group.purchases.map(purchase =>
                this.purchaseService.markAsSent(purchase.id || purchase.purchase_id).toPromise()
            );

            Promise.all(markSentPromises).then(() => {
                group.is_delivery_sent = true;
                this.loadPendencies();
            });
        }
    }

    markGroupAsDeleted(date: string, clientCpf: string): void {
        const client = this.clients.find(c => c.cpf === clientCpf);
        const group = client?.purchase_groups.find(g => g.date === date);
        
        if (group) {
            group.showDeleteOption = false; 
            const deletePromises = group.purchases.map(purchase =>
                this.purchaseService.masAsDeleted(purchase.id || purchase.purchase_id).toPromise()
            );

            Promise.all(deletePromises).then(() => {
                group.is_deleted = true;
                this.loadPendencies();
            });
        }
    }

    toggleGroupDeleteOption(group: PurchaseGroup): void {
        this.clients.forEach(client => {
            client.purchase_groups.forEach(g => {
                if (g !== group) {
                    g.showDeleteOption = false;
                }
            });
        });
        group.showDeleteOption = !group.showDeleteOption;
    }

    toggleGroup(group: PurchaseGroup): void {
        group.isExpanded = !group.isExpanded;
    }

    hasGroupDeliveryRequested(group: PurchaseGroup): boolean {
        return group.purchases.some(p => p.is_delivery_asked);
    }

    openTrackingDialog(date: string, cpf: string) {
        this.showTrackingDialog = true;
        this.selectedGroupDate = date;
        this.selectedClientCpf = cpf;
        this.trackingCode = '';
    }

    cancelTracking() {
        this.showTrackingDialog = false;
        this.trackingCode = '';
        this.selectedGroupDate = undefined;
        this.selectedClientCpf = undefined;
    }

    confirmTracking() {
        if (!this.selectedGroupDate || !this.selectedClientCpf) {
            return;
        }

        const client = this.clients.find(c => c.cpf === this.selectedClientCpf);
        if (client) {
            const group = client.purchase_groups.find(g => g.date === this.selectedGroupDate);
            if (group) {
                const updatePromises = group.purchases.map(purchase =>
                    this.purchaseService.updateTrackingCode(
                        purchase.id || purchase.purchase_id, 
                        this.trackingCode || null
                    ).toPromise()
                );

                Promise.all(updatePromises).then(() => {
                    this.markGroupAsSent(this.selectedGroupDate!, this.selectedClientCpf!);
                    group.tracking_code = this.trackingCode || '';
                    this.cancelTracking();
                });
            }
        }
    }

    hasDeliverySent(client: any): boolean {
        return client.purchase_groups.some((group: any) => group.is_delivery_sent);
    }

    getTrackingCode(client: any): string {
        const group = client.purchase_groups.find((group: any) => group.is_delivery_sent);
        return group ? group.tracking_code : '';
    }
}