import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const resources = {
  tr: {
    translation: {
      // Navigation
      'nav.dashboard': 'Ana Sayfa',
      'nav.users': 'Kullanıcılar',
      
      // Auth
      'auth.signin': 'Giriş Yap',
      'auth.email': 'E-posta Adresi',
      'auth.password': 'Şifre',
      'auth.signin_button': 'Giriş Yap',
      'auth.forgot_password': 'Şifremi Unuttum',
      'auth.signing_in': 'Giriş yapılıyor...',
      'auth.login_failed': 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.',
      
      // Forgot Password
      'forgot.title': 'Şifrenizi Sıfırlayın',
      'forgot.description': 'E-posta adresinizi girin, şifre sıfırlama bağlantısını gönderelim.',
      'forgot.send_button': 'Sıfırlama Bağlantısı Gönder',
      'forgot.sending': 'Gönderiliyor...',
      'forgot.back_to_login': 'Giriş sayfasına dön',
      'forgot.check_email': 'E-postanızı kontrol edin',
      'forgot.email_sent': 'adresine şifre sıfırlama bağlantısı gönderdik.',
      'forgot.no_email': 'E-posta almadınız mı? Spam klasörünü kontrol edin veya',
      'forgot.try_again': 'tekrar deneyin',
      
      // Users
      'users.title': 'Kullanıcılar',
      'users.description': 'Kullanıcı hesaplarını ve izinlerini yönetin',
      'users.add_user': 'Kullanıcı Ekle',
      'users.search': 'Kullanıcı ara...',
      'users.name': 'İsim',
      'users.email': 'E-posta',
      'users.role': 'Rol',
      'users.status': 'Durum',
      'users.created': 'Oluşturulma',
      'users.actions': 'İşlemler',
      'users.no_users': 'Kullanıcı bulunamadı.',
      
      // User Create/Edit
      'user.create_title': 'Kullanıcı Oluştur',
      'user.create_description': 'Sisteme yeni bir kullanıcı ekleyin',
      'user.edit_title': 'Kullanıcı Düzenle',
      'user.edit_description': 'Kullanıcı bilgilerini ve izinlerini güncelleyin',
      'user.full_name': 'Ad Soyad',
      'user.email_address': 'E-posta Adresi',
      'user.password': 'Şifre',
      'user.new_password': 'Yeni Şifre',
      'user.change_password': 'Şifre Değiştir',
      'user.password_hint': 'En az 6 karakter olmalıdır',
      'user.role': 'Rol',
      'user.status': 'Durum',
      'user.back_to_users': 'Kullanıcılara dön',
      'user.cancel': 'İptal',
      'user.create': 'Kullanıcı Oluştur',
      'user.update': 'Kullanıcıyı Güncelle',
      'user.creating': 'Oluşturuluyor...',
      'user.updating': 'Güncelleniyor...',
      'user.create_success': 'Kullanıcı başarıyla oluşturuldu.',
      'user.create_success_named': '{{name}} kullanıcısı başarıyla oluşturuldu.',
      'user.invite_existing': '{{email}} zaten kayıtlı. Davet gönderildi.',
      'user.invite_existing_generic': 'Kullanıcı zaten kayıtlı. Davet gönderildi.',
      'user.create_error': 'Kullanıcı oluşturulamadı. Lütfen bilgileri kontrol edin.',
      'user.invite_error': 'Kullanıcı daveti gönderilemedi.',
      
      // Roles & Status
      'role.user': 'Kullanıcı',
      'role.admin': 'Yönetici',
      'status.active': 'Aktif',
      'status.inactive': 'Pasif',
      'status.pending': 'Davet Bekliyor',
      
      // Common
      'common.loading': 'Yükleniyor...',
      'common.save': 'Kaydet',
      'common.cancel': 'İptal',
      'common.delete': 'Sil',
      'common.edit': 'Düzenle',
      'common.search': 'Ara',
      'common.actions': 'İşlemler',
      
      // Footer
      'footer.contexthub': 'ContextHub',
      'footer.language': 'Dil'
    }
  },
  en: {
    translation: {
      // Navigation
      'nav.dashboard': 'Dashboard',
      'nav.users': 'Users',
      
      // Auth
      'auth.signin': 'Sign in to ContextHub',
      'auth.email': 'Email address',
      'auth.password': 'Password',
      'auth.signin_button': 'Sign in',
      'auth.forgot_password': 'Forgot your password?',
      'auth.signing_in': 'Signing in...',
      'auth.login_failed': 'Login failed. Please check your credentials.',
      
      // Forgot Password
      'forgot.title': 'Reset your password',
      'forgot.description': 'Enter your email address and we\'ll send you a link to reset your password.',
      'forgot.send_button': 'Send reset link',
      'forgot.sending': 'Sending...',
      'forgot.back_to_login': 'Back to login',
      'forgot.check_email': 'Check your email',
      'forgot.email_sent': 'We\'ve sent a password reset link to',
      'forgot.no_email': 'Didn\'t receive the email? Check your spam folder or',
      'forgot.try_again': 'try again',
      
      // Users
      'users.title': 'Users',
      'users.description': 'Manage user accounts and permissions',
      'users.add_user': 'Add User',
      'users.search': 'Search users...',
      'users.name': 'Name',
      'users.email': 'Email',
      'users.role': 'Role',
      'users.status': 'Status',
      'users.created': 'Created',
      'users.actions': 'Actions',
      'users.no_users': 'No users found.',
      
      // User Create/Edit
      'user.create_title': 'Create User',
      'user.create_description': 'Add a new user to the system',
      'user.edit_title': 'Edit User',
      'user.edit_description': 'Update user information and permissions',
      'user.full_name': 'Full Name',
      'user.email_address': 'Email Address',
      'user.password': 'Password',
      'user.new_password': 'New Password',
      'user.change_password': 'Change Password',
      'user.password_hint': 'Must be at least 6 characters long',
      'user.role': 'Role',
      'user.status': 'Status',
      'user.back_to_users': 'Back to Users',
      'user.cancel': 'Cancel',
      'user.create': 'Create User',
      'user.update': 'Update User',
      'user.creating': 'Creating...',
      'user.updating': 'Updating...',
      'user.create_success': 'User created successfully.',
      'user.create_success_named': 'User {{name}} was created successfully.',
      'user.invite_existing': '{{email}} is already registered. Invitation sent.',
      'user.invite_existing_generic': 'User already exists. Invitation sent.',
      'user.create_error': 'Could not create the user. Please check the details.',
      'user.invite_error': 'User invitation could not be sent.',
      
      // Roles & Status
      'role.user': 'User',
      'role.admin': 'Administrator',
      'status.active': 'Active',
      'status.inactive': 'Inactive',
      'status.pending': 'Invitation Pending',
      
      // Common
      'common.loading': 'Loading...',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.search': 'Search',
      'common.actions': 'Actions',
      
      // Footer
      'footer.contexthub': 'ContextHub',
      'footer.language': 'Language'
    }
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('language') || 'tr', // Default to Turkish
    fallbackLng: 'tr',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
