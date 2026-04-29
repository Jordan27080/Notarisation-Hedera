using Microsoft.EntityFrameworkCore;
using NotarisationHedera.API.Models;

namespace NotarisationHedera.API.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<NotarisationRecord> NotarisationRecords => Set<NotarisationRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(u => u.HederaAccountId)
            .IsUnique();

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<NotarisationRecord>()
            .HasIndex(n => n.DocumentHash);

        modelBuilder.Entity<NotarisationRecord>()
            .HasOne(n => n.User)
            .WithMany(u => u.NotarisationRecords)
            .HasForeignKey(n => n.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
