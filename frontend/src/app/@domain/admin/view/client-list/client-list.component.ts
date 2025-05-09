import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { ClientApi } from '../../../../@services/api/client/client.api';
import { ClientTextPipe } from '../../../../@services/pipes/client/client-text.pipe';

import { BackToMenuComponent } from '../../../../@common/components/back-to-menu/back-to-menu.component';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    ClientTextPipe,
    BackToMenuComponent
  ],
  templateUrl: './client-list.component.html'
})
export class ClientListComponent implements OnInit {
  clients: any[] = [];
  filter: string = '';
  showDeleteModal: boolean = false;
  showEditModal: boolean = false;
  clientToDelete: any = null;
  clientToEdit: any = { name: '', instagram: '', cpf: '', phone: '', zip_code: '', address: '', reference_point: '' };
  isLoading: boolean = false;
  isLoadingAction: boolean = false;

  constructor(private clientService: ClientApi, private router: Router) { }

  ngOnInit(): void {
    this.loadClients();
  }

  loadClients() {
    this.isLoading = true;
    this.clientService.client$.subscribe((clients) => {
      this.clients = clients;
      this.isLoading = false;
    });
    this.clientService.getAll();
  }

  editClient(client: any) {
    this.clientToEdit = { ...client };
    this.showEditModal = true;
  }

  closeEditModal() {
    this.showEditModal = false;
  }

  updateClient() {
    this.isLoadingAction = true;
    this.clientService.edit(this.clientToEdit.id, this.clientToEdit).subscribe(() => {
      this.isLoadingAction = false;
      this.closeEditModal();
    });
  }

  deleteClient(client: any) {
    this.clientToDelete = client;
    this.showDeleteModal = true;
  }

  closeDeleteModal() {
    this.showDeleteModal = false;
  }

  confirmDelete() {
    if (this.clientToDelete) {
      this.isLoadingAction = true;
      this.clientService.delete(this.clientToDelete.id).subscribe(() => {
        this.isLoadingAction = false;
        this.closeDeleteModal();
      });
    }
  }

  gotToNewClient(): void {
    this.router.navigate(['/cadastro-clientes']);
  }
}
